"use server";

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { processIncidentPipeline } from "@/lib/pipeline";
import { parseAltSources, serializeAltSources } from "@/lib/sources";
import { synthesizeIncidents, serializeTimeline } from "@/lib/extractor";
import { findNameGroups, extractPersonName, nameMatchScore } from "@/lib/name-utils";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Unauthorized");
}

function extractAltSourcesFromForm(formData: FormData): string | null {
  const raw = formData.getAll("altSources[]") as string[];
  return serializeAltSources(raw);
}

export async function createIncident(formData: FormData) {
  await requireAdmin();
  const url = (formData.get("url") as string)?.trim();
  if (!url) throw new Error("URL is required");

  const incident = await prisma.incident.create({
    data: {
      url,
      altSources: extractAltSourcesFromForm(formData),
      headline: (formData.get("headline") as string)?.trim() || null,
      date: (formData.get("date") as string)?.trim() || null,
      location: (formData.get("location") as string)?.trim() || null,
      summary: (formData.get("summary") as string)?.trim() || null,
      incidentType: (formData.get("incidentType") as string)?.trim() || null,
      country: (formData.get("country") as string)?.trim() || null,
      status: "RAW",
      approved: true, // Admin-added incidents are auto-approved
    },
  });

  revalidatePath("/admin");
  revalidatePath("/");

  // Fire and forget — don't block the response
  processIncidentPipeline(incident.id).catch((err) => {
    console.error(`Pipeline failed for incident ${incident.id}:`, err.message);
  });

  return incident;
}

export async function updateIncident(id: number, formData: FormData) {
  await requireAdmin();

  await prisma.incident.update({
    where: { id },
    data: {
      url: (formData.get("url") as string)?.trim(),
      altSources: extractAltSourcesFromForm(formData),
      headline: (formData.get("headline") as string)?.trim() || null,
      date: (formData.get("date") as string)?.trim() || null,
      location: (formData.get("location") as string)?.trim() || null,
      summary: (formData.get("summary") as string)?.trim() || null,
      incidentType: (formData.get("incidentType") as string)?.trim() || null,
      country: (formData.get("country") as string)?.trim() || null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function deleteIncident(id: number) {
  await requireAdmin();
  await prisma.incident.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function mergeIncidents(ids: number[], primaryId?: number) {
  await requireAdmin();
  if (ids.length < 2) throw new Error("Need at least 2 incidents to merge");

  const incidents = await prisma.incident.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
  });

  if (incidents.length < 2) throw new Error("Could not find enough incidents");

  // Use specified primary, or default to first (lowest ID)
  const primary = primaryId
    ? incidents.find((i) => i.id === primaryId) ?? incidents[0]
    : incidents[0];
  const others = incidents.filter((i) => i.id !== primary.id);

  // Collect all non-primary URLs (other primaries + all altSources)
  const extraUrls: string[] = [
    ...others.map((i) => i.url),
    ...incidents.flatMap((i) => parseAltSources(i.altSources)),
  ].filter((url, idx, arr) => url !== primary.url && arr.indexOf(url) === idx);

  // Synthesize headline + summary + timeline from all incidents
  const { headline, summary, timeline } = await synthesizeIncidents(
    incidents.map((i) => ({
      url: i.url,
      headline: i.headline,
      summary: i.summary,
      date: i.date,
    }))
  );

  // Pick the best metadata: first non-null value across all incidents
  const pick = <T>(fn: (i: typeof primary) => T | null): T | null =>
    incidents.reduce<T | null>((acc, inc) => (acc !== null ? acc : fn(inc)), null);

  // If timeline has events, use the most recent event date as parsedDate
  // so the incident sorts by its latest development in the feed
  let latestParsedDate = pick((i) => i.parsedDate);
  if (timeline.length > 0) {
    const dates = timeline
      .map((e) => {
        const parts = e.date.split("/");
        if (parts.length === 3) {
          return new Date(`${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`);
        }
        return new Date(e.date);
      })
      .filter((d) => !isNaN(d.getTime()));
    if (dates.length > 0) {
      latestParsedDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    }
  }

  await prisma.incident.update({
    where: { id: primary.id },
    data: {
      altSources: extraUrls.length > 0 ? JSON.stringify(extraUrls) : null,
      headline,
      summary,
      timeline: serializeTimeline(timeline),
      date: pick((i) => i.date),
      parsedDate: latestParsedDate,
      location: pick((i) => i.location),
      latitude: pick((i) => i.latitude),
      longitude: pick((i) => i.longitude),
      country: pick((i) => i.country),
      incidentType: pick((i) => i.incidentType),
      status: "COMPLETE",
      approved: true,
    },
  });

  await prisma.incident.deleteMany({
    where: { id: { in: others.map((i) => i.id) } },
  });

  revalidatePath("/admin");
  revalidatePath("/");

  return { survivingId: primary.id };
}

export async function updateIncidentData(
  id: number,
  data: {
    url: string;
    altSources: string | null;
    headline: string | null;
    date: string | null;
    location: string | null;
    summary: string | null;
    incidentType: string | null;
    country: string | null;
  }
) {
  await requireAdmin();
  await prisma.incident.update({ where: { id }, data });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function bulkAddUrls(
  rawText: string
): Promise<{ created: number; skipped: number }> {
  await requireAdmin();

  const urls = rawText
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"))
    .map((u) => {
      try {
        const parsed = new URL(u);
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((p) =>
          parsed.searchParams.delete(p)
        );
        return parsed.toString();
      } catch {
        return u;
      }
    });

  const existing = await prisma.incident.findMany({
    where: { url: { in: urls } },
    select: { url: true },
  });
  const existingSet = new Set(existing.map((e) => e.url));

  const newUrls = urls.filter((u) => !existingSet.has(u));

  for (const url of newUrls) {
    const inc = await prisma.incident.create({ data: { url, status: "RAW" } });
    // Fire-and-forget pipeline
    processIncidentPipeline(inc.id).catch((err) =>
      console.error(`Pipeline failed for ${inc.id}:`, err.message)
    );
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return { created: newUrls.length, skipped: urls.length - newUrls.length };
}

export async function findAndMergeDuplicates(): Promise<{ merged: number; message: string }> {
  await requireAdmin();

  const incidents = await prisma.incident.findMany({
    where: { status: "COMPLETE", headline: { not: null } },
    select: { id: true, headline: true, date: true, location: true },
    orderBy: { parsedDate: "desc" },
    take: 300,
  });

  if (incidents.length < 2) {
    return { merged: 0, message: "Not enough incidents to check" };
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
        content: `Review these ICE incident reports. Identify groups that clearly describe the SAME individual person across multiple articles. Only high-confidence matches. Return ONLY a JSON array of ID arrays, e.g. [[101,205],[88,120]]. If none, return [].

${list}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return { merged: 0, message: "No duplicates found" };

  let groups: number[][] = [];
  try {
    groups = JSON.parse(match[0]);
  } catch {
    return { merged: 0, message: "No duplicates found" };
  }

  if (!groups.length) return { merged: 0, message: "No duplicates found" };

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

  revalidatePath("/admin");
  revalidatePath("/");
  return { merged: mergedCount, message: `Merged ${mergedCount} duplicate group${mergedCount !== 1 ? "s" : ""}` };
}

export async function findDuplicateCandidates(): Promise<{
  groups: Array<{ ids: number[]; headlines: string[]; reason: string }>;
  message: string;
}> {
  await requireAdmin();

  const incidents = await prisma.incident.findMany({
    where: { status: "COMPLETE", headline: { not: null } },
    select: { id: true, headline: true, date: true, location: true },
    orderBy: { parsedDate: "desc" },
    take: 500,
  });

  if (incidents.length < 2) {
    return { groups: [], message: "Not enough incidents to check" };
  }

  // Step 1: Pre-identify name-based matches using Latin American name normalization
  const nameGroups = findNameGroups(
    incidents.filter((i) => i.headline) as Array<{ id: number; headline: string }>
  );

  // Build hints for Claude
  const nameHints = Array.from(nameGroups.entries())
    .map(([name, ids]) => `- "${name}" (IDs: ${ids.join(", ")})`)
    .join("\n");

  // Step 2: Send to Claude with name-match hints for confirmation + additional detection
  const anthropic = new Anthropic();
  const list = incidents
    .map((i) => `[${i.id}] ${i.headline} — ${i.date ?? "?"}, ${i.location ?? "?"}`)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Review these ICE incident reports. Identify groups that clearly describe the SAME individual person across multiple articles. Consider Latin American naming conventions where "Dylan Lopez Contreras" and "Dylan Contreras" could be the same person.

${nameHints ? `Pre-identified possible name matches (verify these):\n${nameHints}\n\n` : ""}All incidents:
${list}

Return ONLY a JSON array of objects: [{"ids": [101, 205], "reason": "Same person: Full Name"}]. If none found, return [].`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return { groups: [], message: "No duplicates found" };

  let rawGroups: Array<{ ids: number[]; reason: string }> = [];
  try {
    rawGroups = JSON.parse(match[0]);
  } catch {
    return { groups: [], message: "No duplicates found" };
  }

  if (!rawGroups.length) return { groups: [], message: "No duplicates found" };

  // Enrich with headlines
  const incidentMap = new Map(incidents.map((i) => [i.id, i.headline ?? ""]));
  const groups = rawGroups
    .filter((g) => g.ids && g.ids.length >= 2)
    .map((g) => ({
      ids: g.ids,
      headlines: g.ids.map((id) => incidentMap.get(id) ?? `ID ${id}`),
      reason: g.reason || "Possible duplicate",
    }));

  return {
    groups,
    message: `Found ${groups.length} potential duplicate group${groups.length !== 1 ? "s" : ""}`,
  };
}

export async function approveIncident(id: number) {
  await requireAdmin();
  await prisma.incident.update({
    where: { id },
    data: { approved: true },
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function approveMultiple(ids: number[]) {
  await requireAdmin();
  await prisma.incident.updateMany({
    where: { id: { in: ids } },
    data: { approved: true },
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function findCombineCandidates(id: number): Promise<{
  candidates: Array<{ id: number; headline: string; date: string | null; score: number }>;
}> {
  await requireAdmin();

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { headline: true, summary: true },
  });

  if (!incident?.headline) return { candidates: [] };

  const name = extractPersonName(incident.headline);

  // Search existing approved incidents
  const existing = await prisma.incident.findMany({
    where: { status: "COMPLETE", approved: true, headline: { not: null }, id: { not: id } },
    select: { id: true, headline: true, date: true },
    orderBy: { parsedDate: "desc" },
    take: 500,
  });

  const scored: Array<{ id: number; headline: string; date: string | null; score: number }> = [];

  for (const e of existing) {
    if (!e.headline) continue;

    let score = 0;

    // Name-based matching
    if (name) {
      const existingName = extractPersonName(e.headline);
      if (existingName) {
        score = nameMatchScore(name, existingName);
      }
    }

    // Also check headline keyword overlap for non-name matches
    if (score < 0.5) {
      const words1 = new Set(incident.headline!.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const words2 = new Set(e.headline.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const overlap = [...words1].filter(w => words2.has(w)).length;
      const maxWords = Math.max(words1.size, words2.size);
      if (maxWords > 0) {
        const wordScore = overlap / maxWords;
        score = Math.max(score, wordScore * 0.7); // Cap at 0.7 for keyword-only matches
      }
    }

    if (score >= 0.3) {
      scored.push({ id: e.id, headline: e.headline, date: e.date, score });
    }
  }

  // Sort by score descending, take top 10
  scored.sort((a, b) => b.score - a.score);
  return { candidates: scored.slice(0, 10) };
}

export async function combineIntoExisting(newId: number, existingId: number) {
  await requireAdmin();
  // Always merge with existingId as primary
  return mergeIncidents([existingId, newId], existingId);
}
