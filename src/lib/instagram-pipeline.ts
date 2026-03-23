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
 * New flow:
 *  1. Embed scrape + Vision  →  caption text + image description
 *  2. Claude extraction      →  generates a clean headline from the caption
 *  3. Exa news search        →  searches for real news articles using that headline
 *  4. Claude extraction      →  re-extracts structured data from the best news article
 *
 * The Instagram post stays as the primary URL; news article URLs go into altSources.
 * findSimilar is intentionally NOT used — it tends to return other Instagram posts.
 */

import Anthropic from "@anthropic-ai/sdk";
import Exa from "exa-js";
import { prisma } from "./db";
import { extractFromText } from "./extractor";
import { archiveUrls } from "./archive";
import { parseIncidentDate, geocodeLocation } from "./geocode";
import { serializeAltSources } from "./sources";

// ─── Instagram embed scraper ─────────────────────────────────────────────────

type EmbedData = {
  caption: string;
  imageUrl: string | null;
  accountName: string | null;
  postDate: string | null;
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

    // Extract post date from embed HTML
    let postDate: string | null = null;
    const datePatterns = [
      /datetime="([^"]+)"/,
      /"taken_at_timestamp"\s*:\s*(\d+)/,
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
    ];
    for (const pat of datePatterns) {
      const m = html.match(pat);
      if (m?.[1]) {
        const d = m[1].length <= 12
          ? new Date(parseInt(m[1]) * 1000)
          : new Date(m[1]);
        if (!isNaN(d.getTime())) {
          postDate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
          break;
        }
      }
    }

    return { caption, imageUrl, accountName, postDate };
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

const SOCIAL_DOMAINS = [
  "instagram.com",
  "instagr.am",   // Instagram short URL domain
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "twitter.com",
  "t.co",         // Twitter URL shortener
  "x.com",
  "threads.net",
  // Link shorteners predominantly used to share social posts
  "dlvr.it",
  "ow.ly",
  "buff.ly",
  "bit.ly",
];

function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SOCIAL_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    // Malformed URL — fall back to substring check (safe for obvious cases like instagr.am)
    return SOCIAL_DOMAINS.some((d) => url.includes(d));
  }
}

/**
 * Search Exa for real news articles about the incident.
 * Uses the extracted headline (not raw caption) so results are specific and on-topic.
 * Does NOT use findSimilar — that tends to return other Instagram posts.
 */
async function findNewsArticles(
  headline: string,
  exa: Exa
): Promise<ExaResult[]> {
  try {
    const searched = await (exa as any).search(headline, {
      numResults: 8,
      type: "keyword",
      excludeDomains: SOCIAL_DOMAINS,
      contents: { text: { maxCharacters: 4000 } },
    });
    return ((searched.results ?? []) as ExaResult[])
      .filter((r) => r.url && !isSocialUrl(r.url))
      .sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0));
  } catch (err: any) {
    console.warn("[instagram-pipeline] news search failed:", err.message);
    return [];
  }
}

/**
 * Ask Claude whether a candidate article covers the SAME SPECIFIC incident
 * (same person, same event) as the reference headline + summary.
 * Returns true only if it's clearly the same incident.
 */
export async function verifyArticleRelevance(
  refHeadline: string,
  refSummary: string,
  article: { url: string; title?: string | null; text?: string | null },
  anthropicKey: string
): Promise<boolean> {
  if (!article.text || article.text.length < 100) return false;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const prompt = `You are verifying whether a news article covers the same specific incident as a reference story.

Reference incident:
Headline: ${refHeadline}
Summary: ${refSummary}

Candidate article (${article.url}):
Title: ${article.title ?? "(no title)"}
Text excerpt: ${article.text.slice(0, 2500)}

Does this candidate article describe the SAME SPECIFIC INCIDENT — the same individual(s) and the same event?
Answer YES only if the article clearly covers this exact incident.
Answer NO if it is a different person, a different event, or only tangentially related (e.g. same topic but different case).
Answer with only YES or NO.`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [{ role: "user", content: prompt }],
    });
    const answer = msg.content[0]?.type === "text" ? msg.content[0].text.trim().toUpperCase() : "NO";
    return answer.startsWith("YES");
  } catch (err: any) {
    console.warn("[instagram-pipeline] relevance check failed:", err.message);
    return false;
  }
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
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const exa = exaKey ? new Exa(exaKey) : null;

    // ── Step 1: Instagram embed → caption + thumbnail ──────────────────────
    console.log(`[instagram-pipeline] Scraping embed for #${incidentId}: ${incident.url}`);
    const embed = await scrapeInstagramEmbed(incident.url);

    // ── Step 2: Claude Vision on the thumbnail ─────────────────────────────
    let visionDesc: string | null = null;
    if (embed?.imageUrl) {
      console.log(`[instagram-pipeline] Running vision on thumbnail…`);
      visionDesc = await analyzeImageWithVision(embed.imageUrl, anthropicKey);
    }

    // ── Step 3: Extract headline from caption first (needed for a good search query) ──
    console.log(`[instagram-pipeline] Extracting headline from caption…`);
    const captionContext = [
      visionDesc ? `[Instagram image description]\n${visionDesc}` : null,
      embed?.caption ? `[Instagram caption]\n${embed.caption}` : null,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 6000);

    const preliminary = captionContext
      ? await extractFromText(captionContext, incident.url, {
          title: null,
          description: null,
          date: null,
          image: null,
          siteName: null,
          author: null,
          jsonLd: null,
        })
      : null;

    // Use the extracted headline as the Exa search query so results are specific.
    // Fall back to a trimmed caption slice only if Claude couldn't produce a headline.
    const searchQuery =
      preliminary?.headline?.trim() ||
      embed?.caption?.slice(0, 200)?.trim() ||
      null;

    // ── Step 4: Exa — search for news articles by headline ─────────────────
    let articles: ExaResult[] = [];
    if (searchQuery && exa) {
      try {
        console.log(`[instagram-pipeline] Searching Exa for: "${searchQuery}"`);
        articles = await findNewsArticles(searchQuery, exa);
      } catch (exaErr: any) {
        console.warn(`[instagram-pipeline] Exa search failed (non-fatal): ${exaErr.message?.substring(0, 80)}`);
      }
    } else if (!exa) {
      console.warn(`[instagram-pipeline] Skipping Exa search — no API key configured`);
    }

    // ── Step 4b: Verify each article is actually about the same incident ───
    // Use the preliminary headline + summary (from caption) as the reference.
    // This filters out topically-similar-but-different-incident results.
    if (articles.length > 0 && preliminary?.headline) {
      const refHeadline = preliminary.headline;
      const refSummary = preliminary.summary ?? "";
      const verified: ExaResult[] = [];
      for (const article of articles) {
        const ok = await verifyArticleRelevance(refHeadline, refSummary, article, anthropicKey);
        console.log(`[instagram-pipeline] ${ok ? "✓" : "✗"} relevance: ${article.url}`);
        if (ok) verified.push(article);
      }
      articles = verified;
    }

    // ── Step 5: Extract structured data ────────────────────────────────────
    // If we found real news articles, extract from the best one (higher quality).
    // Otherwise fall back to the preliminary caption-only extraction.
    let extracted = preliminary;

    if (articles.length > 0) {
      const best = articles[0];
      const bodyText = [
        visionDesc ? `[Instagram image description]\n${visionDesc}` : null,
        embed?.caption ? `[Instagram caption]\n${embed.caption}` : null,
        `[News article: ${best.url}]\n${best.text ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 12000);

      extracted = await extractFromText(bodyText, best.url, {
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
    }

    if (!extracted) {
      throw new Error(
        "Could not extract incident data from Instagram caption or news articles."
      );
    }

    // ── Step 6: Build alt sources ───────────────────────────────────────────
    // Instagram post stays as primary URL; news articles go into altSources.
    // Strip any social-media URLs that may have been saved by earlier pipeline runs.
    const existingAltSources = (
      JSON.parse(incident.altSources ?? "[]") as string[]
    ).filter((u) => !isSocialUrl(u));
    const newNewsUrls = articles.slice(0, 3).map((r) => r.url);
    const altSourceUrls = [
      ...existingAltSources,
      ...newNewsUrls.filter((u) => !existingAltSources.includes(u)),
    ];

    // ── Step 7: Geocode ────────────────────────────────────────────────────
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

    // Use best available date: existing > extracted > embed post date
    const finalDate = incident.date ?? extracted.date ?? embed?.postDate ?? null;
    const parsedDate = parseIncidentDate(finalDate);

    // ── Step 8: Save ───────────────────────────────────────────────────────
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        headline: incident.headline ?? extracted.headline,
        date: finalDate,
        parsedDate,
        location: finalLocation,
        latitude,
        longitude,
        summary: incident.summary ?? extracted.summary,
        incidentType: incident.incidentType ?? extracted.incidentType,
        country: incident.country ?? extracted.country,
        altSources: serializeAltSources(altSourceUrls),
        rawHtml: captionContext.slice(0, 50000),
        status: "COMPLETE",
        errorMessage: null,
      },
    });

    console.log(
      `[instagram-pipeline] ✅ #${incidentId} complete — ` +
        `"${extracted.headline}" | ` +
        `${articles.length} news articles found, ${newNewsUrls.length} saved as alt sources.`
    );

    // Fire-and-forget: archive news article URLs in the Wayback Machine
    if (altSourceUrls.length > 0) {
      archiveUrls(altSourceUrls).catch(() => {});
    }
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
