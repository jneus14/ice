import { prisma } from "./db";
import { scrapeUrl } from "./scraper";
import { extractFromText } from "./extractor";
import { parseIncidentDate, geocodeLocation } from "./geocode";
import { archiveUrl } from "./archive";

const SOCIAL_MEDIA_HOSTS = ["instagram.com", "tiktok.com", "facebook.com/reel"];

function isSocialMediaUrl(url: string): boolean {
  return SOCIAL_MEDIA_HOSTS.some((h) => url.includes(h));
}

/** Extract a search query from a URL slug */
function urlToSearchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    let slug = parts[parts.length - 1] || parts[parts.length - 2] || "";
    slug = slug.replace(/\.html?$/, "").replace(/\.php$/, "");

    if (/^\d+$/.test(slug) || slug.length < 10) {
      slug = parts.filter((p) => p.length > 10 && !/^\d+$/.test(p)).join(" ");
    }

    const words = slug
      .replace(/[-_]/g, " ")
      .replace(/\d{5,}/g, "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter(
        (w) =>
          !["story", "news", "article", "video", "com", "www", "https",
            "politics", "immigration", "html", "amp", "index",
          ].includes(w.toLowerCase())
      );

    if (words.length < 3) return null;
    return words.slice(0, 10).join(" ");
  } catch {
    return null;
  }
}

/** Try to recover a failed scrape by searching Exa for an alternative source */
async function fallbackViaExa(
  incidentId: number,
  originalUrl: string,
  headline: string | null
): Promise<boolean> {
  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) return false;

  const query = headline || urlToSearchQuery(originalUrl);
  if (!query) return false;

  try {
    const Exa = (await import("exa-js")).default;
    const exa = new Exa(exaKey);

    const originalDomain = new URL(originalUrl).hostname.replace("www.", "");
    const results = await exa.search(query, {
      numResults: 3,
      type: "auto",
      excludeDomains: [
        "instagram.com", "twitter.com", "facebook.com", "tiktok.com", "reddit.com",
        originalDomain,
      ],
    });

    const articles = (results.results ?? []).filter((r: any) => r.url);
    if (articles.length === 0) return false;

    const best = articles[0];

    // Get content
    let articleText = "";
    try {
      const contents = await exa.getContents([best.url], {
        text: { maxCharacters: 3000 },
      });
      articleText = contents.results?.[0]?.text ?? "";
    } catch {}

    if (!articleText && best.title) articleText = best.title;
    if (!articleText) return false;

    // Extract using the existing extractor
    const extracted = await extractFromText(articleText, best.url, {
      title: best.title ?? null,
      description: null,
      date: best.publishedDate ?? null,
      image: null,
      siteName: null,
      author: best.author ?? null,
      jsonLd: null,
    });

    if (!extracted.headline && !extracted.summary) return false;

    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) return false;

    const finalDate = incident.date || extracted.date;
    const finalLocation = incident.location || extracted.location;
    const parsedDate = parseIncidentDate(finalDate);

    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      const coords = await geocodeLocation(finalLocation);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }

    // Preserve original URL + other Exa results as alt sources
    const altUrls = [originalUrl, ...articles.slice(1).map((a: any) => a.url)];

    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        url: best.url,
        altSources: JSON.stringify(altUrls),
        headline: incident.headline || extracted.headline,
        date: finalDate,
        parsedDate,
        location: finalLocation,
        latitude,
        longitude,
        summary: incident.summary || extracted.summary,
        incidentType: incident.incidentType || extracted.incidentType,
        country: incident.country || extracted.country,
        imageUrl: incident.imageUrl || null,
        status: "COMPLETE",
        errorMessage: null,
      },
    });

    // Archive the new URL
    archiveUrl(best.url).catch(() => {});

    return true;
  } catch {
    return false;
  }
}

export async function processIncidentPipeline(incidentId: number) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
  });

  if (!incident) throw new Error("Incident not found");

  // Social media posts (Instagram Reels, TikTok, etc.) need a different pipeline
  // that uses Claude Vision + Exa news search instead of direct HTML scraping.
  if (isSocialMediaUrl(incident.url)) {
    const { processInstagramPipeline } = await import("./instagram-pipeline");
    return processInstagramPipeline(incidentId);
  }

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const { metadata, bodyText } = await scrapeUrl(incident.url);

    const extracted = await extractFromText(bodyText, incident.url, metadata);

    const finalDate = incident.date || extracted.date;
    const finalLocation = incident.location || extracted.location;

    // Parse date string into a real Date
    const parsedDate = parseIncidentDate(finalDate);

    // Geocode location if we don't already have coordinates
    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      const coords = await geocodeLocation(finalLocation);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }

    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        rawHtml: bodyText.slice(0, 50000),
        headline: incident.headline || extracted.headline,
        date: finalDate,
        parsedDate,
        location: finalLocation,
        latitude,
        longitude,
        summary: incident.summary || extracted.summary,
        incidentType: incident.incidentType || extracted.incidentType,
        country: incident.country || extracted.country,
        imageUrl: incident.imageUrl || metadata.image || null,
        status: "COMPLETE",
        errorMessage: null,
      },
    });

    // Fire-and-forget: archive the URL in the Wayback Machine
    archiveUrl(incident.url).catch(() => {});

    // Fire-and-forget: scan for duplicate against existing approved incidents
    import("./duplicate-scan")
      .then(({ scanForDuplicate }) => scanForDuplicate(incidentId))
      .catch(() => {});
  } catch (error: any) {
    // Scrape failed — try Exa fallback before giving up
    const recovered = await fallbackViaExa(
      incidentId,
      incident.url,
      incident.headline
    );

    if (!recovered) {
      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          status: "FAILED",
          errorMessage: error.message?.slice(0, 500) || "Unknown error",
        },
      });
      throw error;
    }
  }
}
