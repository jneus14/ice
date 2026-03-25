import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeUrl } from "@/lib/scraper";
import { extractFromText, synthesizeIncidents, serializeTimeline } from "@/lib/extractor";
import { parseAltSources } from "@/lib/sources";
import { parseIncidentDate } from "@/lib/geocode";

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

  // Scrape and extract from each source
  const sources: Array<{
    url: string;
    headline: string | null;
    summary: string | null;
    date: string | null;
  }> = [];

  const errors: string[] = [];

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
    } catch (e: any) {
      errors.push(`${url}: ${e.message?.slice(0, 100) ?? "scrape failed"}`);
    }
  }

  if (sources.length === 0) {
    return NextResponse.json(
      { error: `Could not scrape any sources. ${errors.join("; ")}` },
      { status: 500 }
    );
  }

  try {
    // Single source: use its extraction directly
    if (sources.length === 1) {
      const s = sources[0];
      const bestDate = s.date || incident.date;
      const parsedDate = parseIncidentDate(bestDate);

      await prisma.incident.update({
        where: { id },
        data: {
          headline: s.headline || incident.headline,
          summary: s.summary || incident.summary,
          date: bestDate,
          parsedDate,
        },
      });
      return NextResponse.json({ success: true, sourcesUsed: 1 });
    }

    // Multiple sources: synthesize directly (no mismatch blocking)
    const result = await synthesizeIncidents(sources).catch(() => ({
      headline: sources[0].headline || incident.headline || "Untitled",
      summary: sources[0].summary || incident.summary || "",
      timeline: [] as Array<{ date: string; event: string; source?: string }>,
    }));

    // Pick best date: prefer extracted dates, fall back to existing
    const extractedDates = sources.map((s) => s.date).filter(Boolean) as string[];
    const bestDate = extractedDates[0] || incident.date;
    const parsedDate = parseIncidentDate(bestDate);

    await prisma.incident.update({
      where: { id },
      data: {
        headline: result.headline,
        summary: result.summary,
        date: bestDate,
        parsedDate,
        timeline: serializeTimeline(result.timeline),
      },
    });

    return NextResponse.json({ success: true, sourcesUsed: sources.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Regeneration failed: ${e.message?.slice(0, 200) ?? "unknown error"}` },
      { status: 500 }
    );
  }
}
