import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import { scrapeUrl } from "@/lib/scraper";
import { extractFromText } from "@/lib/extractor";
import { synthesizeIncidentsWithMismatchDetection, serializeTimeline } from "@/lib/extractor";

const EDIT_PASSWORD = "acab";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Collect all URLs: primary + alt sources
  const altUrls = parseAltSources(incident.altSources);
  const allUrls = [incident.url, ...altUrls];

  // Scrape and extract from each URL
  const sources: Array<{ url: string; headline: string | null; summary: string | null; date: string | null }> = [];

  for (const url of allUrls) {
    try {
      const { metadata, bodyText } = await scrapeUrl(url);
      const extracted = await extractFromText(bodyText, url, metadata);
      sources.push({
        url,
        headline: extracted.headline,
        summary: extracted.summary,
        date: extracted.date,
      });
    } catch {
      // Skip URLs that fail to scrape
    }
  }

  if (sources.length === 0) {
    return NextResponse.json({ error: "Failed to scrape any sources" }, { status: 500 });
  }

  let newSummary: string;
  let newHeadline: string;

  if (sources.length === 1) {
    // Single source — use its extraction directly
    newSummary = sources[0].summary || "";
    newHeadline = sources[0].headline || incident.headline || "";
  } else {
    // Multiple sources — synthesize
    const result = await synthesizeIncidentsWithMismatchDetection(sources);
    if (result.mismatch) {
      // Use just the first source if mismatch detected
      newSummary = sources[0].summary || "";
      newHeadline = sources[0].headline || incident.headline || "";
    } else {
      newSummary = result.summary;
      newHeadline = result.headline;

      // Update timeline too
      if (result.timeline.length > 0) {
        await prisma.incident.update({
          where: { id },
          data: { timeline: serializeTimeline(result.timeline) },
        });
      }
    }
  }

  // Update summary and headline
  await prisma.incident.update({
    where: { id },
    data: {
      summary: newSummary,
      headline: newHeadline,
    },
  });

  return NextResponse.json({ success: true, summary: newSummary, headline: newHeadline });
}
