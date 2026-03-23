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
        content: `Review these ICE incident reports. Identify groups that clearly describe the SAME story across multiple articles. Two articles are duplicates if they cover the SAME individual person OR the SAME specific event at the same location. Do NOT group articles that merely share a general topic. Only high-confidence matches. Return ONLY a JSON array of ID arrays, e.g. [[101,205],[88,120]]. If none, return [].

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
        content: `Review these ICE incident reports. Identify groups that clearly describe the SAME story across multiple articles. Two articles are duplicates if they cover:
1. The SAME individual person (consider Latin American naming conventions where "Dylan Lopez Contreras" and "Dylan Contreras" could be the same person), OR
2. The SAME specific event/incident at the same location (e.g. two articles about a raid at the same facility, agents leaving the same base, the same protest at the same place)

Do NOT group articles that merely share a general topic (e.g. two unrelated raids in the same city). Only group articles covering the exact same story.

${nameHints ? `Pre-identified possible name matches (verify these):\n${nameHints}\n\n` : ""}All incidents:
${list}

Return ONLY a JSON array of objects: [{"ids": [101, 205], "reason": "Same person: Full Name"} or {"ids": [101, 205], "reason": "Same event: Terminal Island departure"}]. If none found, return [].`,
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

/** Extract all person names from text. Finds capitalized multi-word sequences. */
function extractAllPersonNames(text: string): string[] {
  if (!text) return [];
  const namePattern = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})\b/g;
  const names: string[] = [];
  const stopNames = new Set(["United States", "Border Patrol", "White House", "Supreme Court", "Federal Court", "Immigration Judge", "Central Louisiana", "South Burlington", "Salt Lake", "San Antonio", "Los Angeles", "New York", "North Carolina", "South Carolina", "San Diego", "San Francisco", "El Salvador", "Costa Rica", "Puerto Rico", "Dominican Republic", "Federal Plaza", "District Court", "Customs Enforcement", "Homeland Security", "National Guard"]);
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    if (!stopNames.has(name) && name.length > 5) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

export async function findCombineCandidates(id: number): Promise<{
  candidates: Array<{ id: number; headline: string; date: string | null; location: string | null; score: number }>;
}> {
  await requireAdmin();

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { headline: true, summary: true, location: true },
  });

  if (!incident?.headline) return { candidates: [] };

  // Extract names from BOTH headline and summary
  const headlineName = extractPersonName(incident.headline);
  const summaryNames = extractAllPersonNames(incident.summary ?? "");
  const allSourceNames = [headlineName, ...summaryNames].filter(Boolean) as string[];

  // Search existing incidents — include summary for matching
  const existing = await prisma.incident.findMany({
    where: { status: "COMPLETE", headline: { not: null }, id: { not: id } },
    select: { id: true, headline: true, summary: true, date: true, location: true },
    orderBy: { parsedDate: "desc" },
    take: 1000,
  });

  const stopwords = new Set(["after", "with", "from", "that", "this", "their", "about", "been", "have", "were", "they", "will", "would", "could", "should", "during", "before", "while", "under", "between", "through", "against", "without", "within", "also", "than", "more", "said", "says", "according", "told", "over", "into", "being", "which", "when", "where", "some", "other", "year", "years", "people", "including", "since", "states", "united", "federal", "immigration", "detained", "detention", "agents", "enforcement"]);
  function getKeywords(text: string): Set<string> {
    return new Set(
      text.toLowerCase().split(/\s+/)
        .map(w => w.replace(/[^a-záéíóúñü]/g, ""))
        .filter(w => w.length > 3 && !stopwords.has(w))
    );
  }

  // Combine headline + summary keywords for richer matching
  const words1 = getKeywords(incident.headline + " " + (incident.summary ?? ""));
  const loc1 = incident.location?.toLowerCase().trim() ?? "";

  const scored: Array<{ id: number; headline: string; date: string | null; location: string | null; score: number }> = [];

  for (const e of existing) {
    if (!e.headline) continue;

    let score = 0;
    const existingSummary = e.summary ?? "";
    const existingFullText = e.headline + " " + existingSummary;

    // Name-based matching: check all names from source against headline + summary of existing
    const existingHeadlineName = extractPersonName(e.headline);
    const existingSummaryNames = extractAllPersonNames(existingSummary);
    const allExistingNames = [existingHeadlineName, ...existingSummaryNames].filter(Boolean) as string[];

    // Find best name match across all name pairs
    for (const srcName of allSourceNames) {
      for (const existName of allExistingNames) {
        const s = nameMatchScore(srcName, existName);
        if (s > score) score = s;
      }
    }

    // Also check if any source name appears as substring in existing full text
    if (score < 0.5) {
      const existingLower = existingFullText.toLowerCase();
      for (const srcName of allSourceNames) {
        const nameLower = srcName.toLowerCase();
        if (existingLower.includes(nameLower)) {
          score = Math.max(score, 0.9);
        } else {
          // Check first name + any surname
          const parts = nameLower.split(/\s+/);
          if (parts.length >= 2) {
            const firstName = parts[0];
            const surnames = parts.slice(1);
            const firstMatch = existingLower.includes(firstName);
            const surnameMatch = surnames.some(s => s.length > 3 && existingLower.includes(s));
            if (firstMatch && surnameMatch) {
              score = Math.max(score, 0.75);
            }
          }
        }
      }
    }

    // Keyword overlap using full text (headline + summary)
    if (score < 0.5) {
      const words2 = getKeywords(existingFullText);
      const overlap = [...words1].filter(w => words2.has(w)).length;
      const minWords = Math.min(words1.size, words2.size);
      if (minWords > 0) {
        const wordScore = overlap / minWords;
        const loc2 = e.location?.toLowerCase().trim() ?? "";
        const locMatch = loc1 && loc2 && (loc1.includes(loc2) || loc2.includes(loc1) || loc1 === loc2);
        const locationBoost = locMatch ? 0.15 : 0;
        const keywordScore = Math.min(wordScore * 0.8 + locationBoost, 0.95);
        score = Math.max(score, keywordScore);
      }
    }

    if (score >= 0.3) {
      scored.push({ id: e.id, headline: e.headline, date: e.date, location: e.location ?? null, score });
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
