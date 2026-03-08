"use server";

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { processIncidentPipeline } from "@/lib/pipeline";
import { parseAltSources, serializeAltSources } from "@/lib/sources";
import { synthesizeIncidents } from "@/lib/extractor";

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

export async function mergeIncidents(ids: number[]) {
  await requireAdmin();
  if (ids.length < 2) throw new Error("Need at least 2 incidents to merge");

  const incidents = await prisma.incident.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
  });

  if (incidents.length < 2) throw new Error("Could not find enough incidents");

  const primary = incidents[0];
  const others = incidents.slice(1);

  // Collect all non-primary URLs (other primaries + all altSources)
  const extraUrls: string[] = [
    ...others.map((i) => i.url),
    ...incidents.flatMap((i) => parseAltSources(i.altSources)),
  ].filter((url, idx, arr) => url !== primary.url && arr.indexOf(url) === idx);

  // Synthesize headline + summary from all incidents
  const { headline, summary } = await synthesizeIncidents(
    incidents.map((i) => ({
      url: i.url,
      headline: i.headline,
      summary: i.summary,
    }))
  );

  // Pick the best metadata: first non-null value across all incidents
  const pick = <T>(fn: (i: typeof primary) => T | null): T | null =>
    incidents.reduce<T | null>((acc, inc) => (acc !== null ? acc : fn(inc)), null);

  await prisma.incident.update({
    where: { id: primary.id },
    data: {
      altSources: extraUrls.length > 0 ? JSON.stringify(extraUrls) : null,
      headline,
      summary,
      date: pick((i) => i.date),
      location: pick((i) => i.location),
      latitude: pick((i) => i.latitude),
      longitude: pick((i) => i.longitude),
      country: pick((i) => i.country),
      incidentType: pick((i) => i.incidentType),
      status: "COMPLETE",
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
