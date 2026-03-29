/**
 * Merge a cluster of incidents into one.
 * POST /api/incidents/cluster-merge
 * Body: { ids: number[], approve?: boolean }
 *
 * Takes the most recent date as the primary date.
 * Synthesizes headline/summary from all sources.
 * Keeps the first ID as the survivor, deletes the rest.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { synthesizeIncidents, serializeTimeline } from "@/lib/extractor";
import { parseAltSources } from "@/lib/sources";
import { parseIncidentDate } from "@/lib/geocode";

const EDIT_PASSWORD = "acab";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ids: number[] = body.ids;
  const shouldApprove = body.approve === true;

  if (!Array.isArray(ids) || ids.length < 2) {
    return NextResponse.json({ error: "Need at least 2 incident IDs" }, { status: 400 });
  }

  const incidents = await prisma.incident.findMany({
    where: { id: { in: ids } },
  });

  if (incidents.length < 2) {
    return NextResponse.json({ error: "Not enough incidents found" }, { status: 404 });
  }

  // Sort by parsedDate descending so the most recent is first
  incidents.sort((a, b) => {
    const da = a.parsedDate?.getTime() ?? 0;
    const db = b.parsedDate?.getTime() ?? 0;
    return db - da;
  });

  const primary = incidents[0]; // most recent
  const others = incidents.slice(1);

  // Collect all URLs
  const allUrls = new Set<string>();
  allUrls.add(primary.url);
  for (const inc of incidents) {
    allUrls.add(inc.url);
    for (const alt of parseAltSources(inc.altSources)) {
      allUrls.add(alt);
    }
  }
  // altSources = everything except the primary URL
  const altUrls = [...allUrls].filter((u) => u !== primary.url);

  // Synthesize headline and summary from all sources
  const sources = incidents.map((i) => ({
    url: i.url,
    headline: i.headline,
    summary: i.summary,
    date: i.date,
  }));

  const synthesized = await synthesizeIncidents(sources).catch(() => ({
    headline: primary.headline || others[0]?.headline || "Untitled",
    summary: incidents.map((i) => i.summary).filter(Boolean).join(" "),
    timeline: [] as Array<{ date: string; event: string; source?: string }>,
  }));

  // Use the most recent date
  const bestDate = primary.date || others.find((i) => i.date)?.date || null;
  const parsedDate = parseIncidentDate(bestDate);

  // Merge location, country, incidentType, imageUrl from best available
  const location = primary.location || others.find((i) => i.location)?.location || null;
  const latitude = primary.latitude || others.find((i) => i.latitude)?.latitude || null;
  const longitude = primary.longitude || others.find((i) => i.longitude)?.longitude || null;
  const country = primary.country || others.find((i) => i.country)?.country || null;
  const imageUrl = primary.imageUrl || others.find((i) => i.imageUrl)?.imageUrl || null;

  // Merge incident types (union of all tags)
  const allTags = new Set<string>();
  for (const inc of incidents) {
    if (inc.incidentType) {
      for (const tag of inc.incidentType.split(",").map((t) => t.trim()).filter(Boolean)) {
        allTags.add(tag);
      }
    }
  }
  const incidentType = allTags.size > 0 ? [...allTags].join(", ") : null;

  // Update the primary incident
  await prisma.incident.update({
    where: { id: primary.id },
    data: {
      headline: synthesized.headline,
      summary: synthesized.summary,
      timeline: serializeTimeline(synthesized.timeline),
      altSources: altUrls.length > 0 ? JSON.stringify(altUrls) : null,
      date: bestDate,
      parsedDate,
      location,
      latitude,
      longitude,
      country,
      incidentType,
      imageUrl,
      approved: shouldApprove,
      lastCombinedAt: new Date(),
    },
  });

  // Delete all others
  await prisma.incident.deleteMany({
    where: { id: { in: others.map((i) => i.id) } },
  });

  return NextResponse.json({
    success: true,
    survivingId: primary.id,
    mergedCount: others.length,
  });
}
