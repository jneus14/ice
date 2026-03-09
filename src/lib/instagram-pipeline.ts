/**
 * Instagram / social-media pipeline.
 *
 * Because Instagram posts can't be scraped with a plain HTTP fetch, this
 * pipeline uses two complementary strategies:
 *
 *  1. Instagram embed endpoint  →  grabs caption text + OG thumbnail URL
 *  2. Claude Vision             →  describes the thumbnail image
 *  3. Exa findSimilar + search  →  discovers news articles covering the same incident
 *  4. Claude extraction         →  structures everything into a typed incident record
 *
 * The whole flow runs server-side and works on Railway (no headless browser needed).
 */

import Anthropic from "@anthropic-ai/sdk";
import Exa from "exa-js";
import { prisma } from "./db";
import { extractFromText } from "./extractor";
import { parseIncidentDate, geocodeLocation } from "./geocode";
import { serializeAltSources } from "./sources";

// ─── Instagram embed scraper ─────────────────────────────────────────────────

type EmbedData = {
  caption: string;
  imageUrl: string | null;
  accountName: string | null;
};

/**
 * Fetch the Instagram embed page (works for public posts/reels without login)
 * and extract caption text, OG image URL, and account name.
 */
async function scrapeInstagramEmbed(url: string): Promise<EmbedData | null> {
  try {
    const shortcode = url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[2];
    if (!shortcode) return null;

    // The /embed/captioned/ endpoint renders without full JS and is publicly accessible
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const html = await response.text();

    // Caption can appear in a few places depending on embed version
    const captionPatterns = [
      /class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /"edge_media_to_caption".*?"text"\s*:\s*"([^"]{10,})"/,
      /og:description.*?content="([^"]{10,})"/i,
    ];
    let caption = "";
    for (const re of captionPatterns) {
      const m = html.match(re);
      if (m?.[1]) {
        caption = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        break;
      }
    }

    // OG image
    const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const imageUrl = imgMatch?.[1] ?? null;

    // Account name from URL patterns in the HTML
    const accountMatch = html.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})\//);
    const accountName = accountMatch?.[1] ?? null;

    return { caption, imageUrl, accountName };
  } catch {
    return null;
  }
}

// ─── Claude Vision analysis ───────────────────────────────────────────────────

const VISION_PROMPT =
  `This image is from an Instagram post about a U.S. immigration enforcement incident.
Describe concisely (3-5 sentences):
1. What is happening in the image/video frame
2. Any text, captions, or overlays visible
3. Location or identifying details if present
4. Context clues about the nature of the enforcement action
Be factual and specific. Do not speculate beyond what is visible.`;

async function analyzeImageWithVision(imageUrl: string, apiKey: string): Promise<string | null> {
  try {
    const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imageRes.ok) return null;

    const buf = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const rawType = imageRes.headers.get("content-type") ?? "image/jpeg";
    const mediaType = rawType.split(";")[0].trim() as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });

    const content = msg.content[0];
    return content.type === "text" ? content.text.trim() : null;
  } catch (err: any) {
    console.warn("[instagram-pipeline] Vision failed:", err.message);
    return null;
  }
}

// ─── Exa news discovery ───────────────────────────────────────────────────────

type ExaResult = {
  url: string;
  title?: string | null;
  text?: string | null;
  publishedDate?: string | null;
  author?: string | null;
};

const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"];

async function findNewsArticles(
  instagramUrl: string,
  searchQuery: string | null,
  exa: Exa
): Promise<ExaResult[]> {
  const results: ExaResult[] = [];
  const seenUrls = new Set<string>([instagramUrl]);

  const add = (r: ExaResult) => {
    if (r.url && !seenUrls.has(r.url) && !SOCIAL_DOMAINS.some((d) => r.url.includes(d))) {
      seenUrls.add(r.url);
      results.push(r);
    }
  };

  // Strategy 1: keyword news search from caption/vision (primary — finds actual news articles)
  if (searchQuery) {
    try {
      const searched = await (exa as any).search(
        `ICE immigration enforcement: ${searchQuery.slice(0, 250)}`,
        {
          numResults: 8,
          type: "news",
          excludeDomains: SOCIAL_DOMAINS,
          contents: { text: { maxCharacters: 4000 } },
        }
      );
      (searched.results ?? []).forEach(add);
    } catch (err: any) {
      console.warn("[instagram-pipeline] keyword search failed:", err.message);
    }
  }

  // Strategy 2: findSimilar as fallback if keyword search didn't find enough
  if (results.length < 2) {
    try {
      const similar = await exa.findSimilar(instagramUrl, {
        numResults: 6,
        excludeDomains: SOCIAL_DOMAINS,
        contents: { text: { maxCharacters: 4000 } as any },
      });
      (similar.results ?? []).forEach(add);
    } catch (err: any) {
      console.warn("[instagram-pipeline] findSimilar failed:", err.message);
    }
  }

  // Sort by text length descending (more text = more useful article)
  return results.sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0));
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function processInstagramPipeline(incidentId: number): Promise<void> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) throw new Error("Incident not found");

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const exaKey = process.env.EXA_API_KEY;
    if (!exaKey) throw new Error("EXA_API_KEY is not configured");

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const exa = new Exa(exaKey);

    // ── Step 1: Instagram embed → caption + thumbnail ──────────────────────
    console.log(`[instagram-pipeline] Scraping embed for #${incidentId}: ${incident.url}`);
    const embed = await scrapeInstagramEmbed(incident.url);

    // ── Step 2: Claude Vision on the thumbnail ─────────────────────────────
    let visionDesc: string | null = null;
    if (embed?.imageUrl) {
      console.log(`[instagram-pipeline] Running vision on thumbnail…`);
      visionDesc = await analyzeImageWithVision(embed.imageUrl, anthropicKey);
    }

    // Build a rich search query from all context we have
    const contextParts = [
      embed?.caption ? `Caption: ${embed.caption.slice(0, 300)}` : null,
      visionDesc ? `Visual: ${visionDesc.slice(0, 200)}` : null,
      embed?.accountName ? `Account: @${embed.accountName}` : null,
    ].filter(Boolean);
    const searchQuery = contextParts.length > 0 ? contextParts.join(" | ") : null;

    // ── Step 3: Exa — find news articles covering the same incident ─────────
    console.log(`[instagram-pipeline] Searching Exa for news coverage…`);
    const articles = await findNewsArticles(incident.url, searchQuery, exa);

    if (articles.length === 0) {
      throw new Error(
        "Exa found no news articles for this Instagram post. " +
          "Try adding a URL manually or check back later when more coverage exists."
      );
    }

    // ── Step 4: Extract structured data from the best article ──────────────
    const best = articles[0];
    const bodyText = [
      visionDesc ? `[Instagram image description]\n${visionDesc}` : null,
      embed?.caption ? `[Instagram caption]\n${embed.caption}` : null,
      `[News article: ${best.url}]\n${best.text ?? ""}`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);

    const extracted = await extractFromText(bodyText, best.url, {
      title: best.title ?? null,
      description: null,
      date: best.publishedDate ?? null,
      image: null,
      siteName: (() => {
        try {
          return new URL(best.url).hostname.replace("www.", "");
        } catch {
          return null;
        }
      })(),
      author: best.author ?? null,
      jsonLd: null,
    });

    // ── Step 5: Build alt sources ───────────────────────────────────────────
    // The Instagram post stays as the primary URL; all news articles go into altSources
    const altSourceUrls = articles.slice(0, 5).map((r) => r.url);

    // ── Step 6: Geocode ────────────────────────────────────────────────────
    const finalLocation = incident.location ?? extracted.location;
    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      const coords = await geocodeLocation(finalLocation);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }

    const parsedDate = parseIncidentDate(incident.date ?? extracted.date);

    // ── Step 7: Save ───────────────────────────────────────────────────────
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        headline: incident.headline ?? extracted.headline,
        date: incident.date ?? extracted.date,
        parsedDate,
        location: finalLocation,
        latitude,
        longitude,
        summary: incident.summary ?? extracted.summary,
        incidentType: incident.incidentType ?? extracted.incidentType,
        country: incident.country ?? extracted.country,
        // Merge any existing altSources with the newly found news URLs
        altSources: serializeAltSources([
          ...JSON.parse(incident.altSources ?? "[]") as string[],
          ...altSourceUrls,
        ]),
        rawHtml: bodyText.slice(0, 50000),
        status: "COMPLETE",
        errorMessage: null,
      },
    });

    console.log(
      `[instagram-pipeline] ✅ #${incidentId} complete — ` +
        `${articles.length} articles found, ${altSourceUrls.length} saved as alt sources.`
    );
  } catch (error: any) {
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: "FAILED",
        errorMessage: error.message?.slice(0, 500) ?? "Unknown error",
      },
    });
    throw error;
  }
}
