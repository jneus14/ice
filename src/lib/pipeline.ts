import { prisma } from "./db";
import { scrapeUrl } from "./scraper";
import { extractFromText } from "./extractor";
import { parseIncidentDate, geocodeLocation } from "./geocode";
import { archiveUrl } from "./archive";

const SOCIAL_MEDIA_HOSTS = ["instagram.com", "tiktok.com", "facebook.com/reel"];

function isSocialMediaUrl(url: string): boolean {
  return SOCIAL_MEDIA_HOSTS.some((h) => url.includes(h));
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
  } catch (error: any) {
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
