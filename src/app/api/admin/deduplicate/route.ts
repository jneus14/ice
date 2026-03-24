import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import { synthesizeIncidents, serializeTimeline } from "@/lib/extractor";

// Allow up to 5 minutes for this endpoint
export const maxDuration = 300;

const EDIT_PASSWORD = "acab";

async function mergeIncidents(ids: number[]) {
  if (ids.length < 2) return;

  const incidents = await prisma.incident.findMany({
    where: { id: { in: ids } },
    orderBy: { parsedDate: "desc" },
  });

  if (incidents.length < 2) return;

  const primary = incidents[0];
  const secondaries = incidents.slice(1);

  // Collect all URLs
  const existingAlt = parseAltSources(primary.altSources);
  const allUrls = new Set([primary.url, ...existingAlt]);
  for (const sec of secondaries) {
    allUrls.add(sec.url);
    for (const u of parseAltSources(sec.altSources)) allUrls.add(u);
  }
  allUrls.delete(primary.url);

  // Synthesize
  const sources = incidents.map((i) => ({
    url: i.url,
    headline: i.headline,
    summary: i.summary,
    date: i.date,
  }));

  const result = await synthesizeIncidents(sources).catch(() => ({
    headline: primary.headline || "Untitled",
    summary: incidents.map((i) => i.summary).filter(Boolean).join(" "),
    timeline: [] as Array<{ date: string; event: string; source?: string }>,
  }));

  await prisma.incident.update({
    where: { id: primary.id },
    data: {
      altSources: allUrls.size > 0 ? JSON.stringify([...allUrls]) : null,
      headline: result.headline,
      summary: result.summary,
      timeline: serializeTimeline(result.timeline),
      location: primary.location || secondaries.find((s) => s.location)?.location,
      latitude: primary.latitude || secondaries.find((s) => s.latitude)?.latitude,
      longitude: primary.longitude || secondaries.find((s) => s.longitude)?.longitude,
      country: primary.country || secondaries.find((s) => s.country)?.country,
      incidentType: primary.incidentType || secondaries.find((s) => s.incidentType)?.incidentType,
    },
  });

  // Delete secondaries
  await prisma.incident.deleteMany({
    where: { id: { in: secondaries.map((s) => s.id) } },
  });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incidents = await prisma.incident.findMany({
    where: { status: "COMPLETE", headline: { not: null } },
    select: { id: true, headline: true, date: true, location: true },
    orderBy: { parsedDate: "desc" },
    take: 300,
  });

  if (incidents.length < 2) {
    return NextResponse.json({ merged: 0, message: "Not enough incidents to check" });
  }

  const anthropic = new Anthropic();
  const list = incidents
    .map((i) => `[${i.id}] ${i.headline} — ${i.date ?? "?"}, ${i.location ?? "?"}`)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Review these ICE incident reports. Identify groups that clearly describe the SAME story across multiple articles. Two articles are duplicates if they cover the SAME individual person OR the SAME specific event at the same location. Do NOT group articles that merely share a general topic. Only high-confidence matches. Return ONLY a JSON array of ID arrays, e.g. [[101,205],[88,120]]. If none, return [].

${list}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return NextResponse.json({ merged: 0, message: "No duplicates found" });

  let groups: number[][] = [];
  try {
    groups = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ merged: 0, message: "No duplicates found" });
  }

  if (!groups.length) return NextResponse.json({ merged: 0, message: "No duplicates found" });

  let mergedCount = 0;
  for (const group of groups) {
    if (group.length >= 2) {
      try {
        await mergeIncidents(group);
        mergedCount++;
      } catch (e) {
        console.error("Failed to merge group", group, e);
      }
    }
  }

  return NextResponse.json({
    merged: mergedCount,
    message: `Merged ${mergedCount} duplicate group${mergedCount !== 1 ? "s" : ""}`,
  });
}
