/**
 * Standalone deduplication script.
 * Finds incidents about the same individual and merges them.
 * Usage: npx tsx scripts/dedup-incidents.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 200;

function parseAltSources(altSources: string | null): string[] {
  if (!altSources) return [];
  const trimmed = altSources.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [trimmed];
    } catch {
      return [trimmed].filter(Boolean);
    }
  }
  return [trimmed].filter(Boolean);
}

async function synthesize(
  incidents: Array<{ url: string; headline: string | null; summary: string | null }>
): Promise<{ headline: string; summary: string }> {
  const content = incidents
    .map(
      (inc, i) =>
        `--- Source ${i + 1} ---\nURL: ${inc.url}` +
        (inc.headline ? `\nHeadline: ${inc.headline}` : "") +
        (inc.summary ? `\nSummary: ${inc.summary}` : "")
    )
    .join("\n\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You synthesize multiple news articles about the same ICE incident into a single headline and summary. Return ONLY valid JSON: {\"headline\": \"...\", \"summary\": \"...\"}. The headline should be clear and factual. The summary (2-3 sentences) should synthesize all key facts and updates across sources.",
    messages: [
      {
        role: "user",
        content: `Synthesize these sources about the same individual:\n\n${content}`,
      },
    ],
  });

  const text =
    msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
  let jsonStr = text;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const parsed = JSON.parse(jsonStr);
  return { headline: parsed.headline || "", summary: parsed.summary || "" };
}

async function findDuplicatesInBatch(
  batch: Array<{ id: number; headline: string | null; date: string | null; location: string | null }>
): Promise<number[][]> {
  const list = batch
    .map((i) => `[${i.id}] ${i.headline} — ${i.date ?? "?"}, ${i.location ?? "?"}`)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Review these ICE incident reports. Identify groups that clearly describe the SAME individual person across multiple articles (e.g. multiple articles covering the same death, detention, or deportation of the same named person). Only high-confidence matches where you are sure it is the same person/event. Return ONLY a JSON array of ID arrays, e.g. [[101,205],[88,120,131]]. If none, return [].

${list}`,
      },
    ],
  });

  const text =
    msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const groups: unknown = JSON.parse(match[0]);
    if (!Array.isArray(groups)) return [];
    return (groups as unknown[]).filter(
      (g): g is number[] => Array.isArray(g) && g.length >= 2
    );
  } catch {
    return [];
  }
}

async function mergeGroup(ids: number[]): Promise<number> {
  const incidents = await prisma.incident.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
  });

  if (incidents.length < 2) return 0;

  const primary = incidents[0];
  const others = incidents.slice(1);

  const extraUrls = [
    ...others.map((i) => i.url),
    ...incidents.flatMap((i) => parseAltSources(i.altSources)),
  ].filter((url, idx, arr) => url !== primary.url && arr.indexOf(url) === idx);

  const { headline, summary } = await synthesize(
    incidents.map((i) => ({ url: i.url, headline: i.headline, summary: i.summary }))
  );

  const pick = <T>(fn: (i: typeof primary) => T | null): T | null =>
    incidents.reduce<T | null>((acc, inc) => (acc !== null ? acc : fn(inc)), null);

  if (!DRY_RUN) {
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
  }

  console.log(
    `  ${DRY_RUN ? "[DRY RUN] Would merge" : "Merged"} [${ids.join(", ")}] → ID ${primary.id}`
  );
  console.log(`  Headline: ${headline}`);
  return 1;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}\n`);

  const all = await prisma.incident.findMany({
    where: { status: "COMPLETE", headline: { not: null } },
    select: { id: true, headline: true, date: true, location: true },
    orderBy: { parsedDate: "desc" },
  });

  console.log(`Found ${all.length} COMPLETE incidents to check.\n`);

  // Deduplicate across batches: track merged IDs so we skip already-merged ones
  const mergedIds = new Set<number>();
  let totalMerged = 0;

  for (let offset = 0; offset < all.length; offset += BATCH_SIZE) {
    const batch = all
      .slice(offset, offset + BATCH_SIZE)
      .filter((i) => !mergedIds.has(i.id));

    if (batch.length < 2) continue;

    console.log(
      `Batch ${Math.floor(offset / BATCH_SIZE) + 1}/${Math.ceil(all.length / BATCH_SIZE)} (${batch.length} incidents)...`
    );

    const groups = await findDuplicatesInBatch(batch);

    if (groups.length === 0) {
      console.log("  No duplicates found.\n");
      continue;
    }

    console.log(`  Found ${groups.length} duplicate group(s).`);

    for (const group of groups) {
      // Skip if any ID already merged
      if (group.some((id) => mergedIds.has(id))) {
        console.log(`  Skipping group [${group.join(", ")}] — already merged.`);
        continue;
      }
      const merged = await mergeGroup(group);
      if (merged) {
        totalMerged += merged;
        group.forEach((id) => mergedIds.add(id));
      }
    }
    console.log();
  }

  console.log(
    `\nDone. ${DRY_RUN ? "Would have merged" : "Merged"} ${totalMerged} group(s).`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
