/**
 * Fix timeline events that are missing source attribution.
 * Uses Claude Haiku to attribute source URLs to timeline events
 * based on URL domains and event descriptions.
 *
 * Run: npx tsx scripts/fix-timeline-sources.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 10;

type TimelineEvent = {
  date: string;
  event: string;
  sources?: string[];
};

type Incident = {
  id: number;
  url: string;
  altSources: string | null;
  timeline: string;
  headline: string | null;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseTimeline(raw: string): TimelineEvent[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((e: any) => e?.date && e?.event);
    return [];
  } catch {
    return [];
  }
}

function getSourceUrls(incident: Incident): string[] {
  const urls: string[] = [incident.url];
  if (incident.altSources) {
    try {
      const alt = JSON.parse(incident.altSources);
      if (Array.isArray(alt)) {
        for (const s of alt) {
          const u = typeof s === "string" ? s : s?.url;
          if (u) urls.push(u);
        }
      }
    } catch {}
  }
  return urls;
}

async function attributeBatch(
  incidents: { id: number; headline: string | null; events: TimelineEvent[]; sourceUrls: string[] }[]
): Promise<Map<number, TimelineEvent[]>> {
  const incidentTexts = incidents
    .map((inc) => {
      const eventsText = inc.events
        .map((e, i) => `  Event ${i}: [${e.date}] ${e.event}`)
        .join("\n");
      const sourcesText = inc.sourceUrls
        .map((u, i) => `  Source ${i}: ${u}`)
        .join("\n");
      return `Incident ${inc.id} (${inc.headline ?? "no headline"}):\nTimeline events:\n${eventsText}\nSource URLs:\n${sourcesText}`;
    })
    .join("\n\n---\n\n");

  const prompt = `For each incident below, assign source URLs to timeline events. Each timeline event should be attributed to the source(s) that most likely reported on that specific event.

Rules:
- If there's only 1 source URL, assign it to ALL events.
- If there are multiple sources, use domain names and event descriptions to guess which source(s) cover each event. When unsure, assign all sources.
- Return sourceIndices as 0-based indices into the Source URLs list for each incident.

Return ONLY valid JSON (no markdown) in this exact format:
{
  "results": [
    {
      "id": <incident_id>,
      "events": [
        {"eventIndex": 0, "sourceIndices": [0]},
        {"eventIndex": 1, "sourceIndices": [0, 1]}
      ]
    }
  ]
}

INCIDENTS:
${incidentTexts}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    console.warn("  Failed to find JSON in response");
    return new Map();
  }

  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    const resultMap = new Map<number, TimelineEvent[]>();

    for (const result of parsed.results ?? []) {
      const inc = incidents.find((i) => i.id === result.id);
      if (!inc) continue;

      const updatedEvents = inc.events.map((e, idx) => {
        const mapping = (result.events ?? []).find((m: any) => m.eventIndex === idx);
        if (mapping && Array.isArray(mapping.sourceIndices)) {
          const sources = mapping.sourceIndices
            .map((si: number) => inc.sourceUrls[si])
            .filter(Boolean);
          return { ...e, sources: sources.length > 0 ? sources : undefined };
        }
        // Fallback: assign all sources
        return { ...e, sources: inc.sourceUrls };
      });

      resultMap.set(result.id, updatedEvents);
    }

    return resultMap;
  } catch (err) {
    console.warn("  Failed to parse JSON response:", text.slice(0, 300));
    return new Map();
  }
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN -- no changes will be written.\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Find COMPLETE incidents with timeline but no source attribution on any event
  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, url, "altSources", timeline, headline
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND timeline IS NOT NULL
       AND timeline != '[]'
     ORDER BY id`
  );

  // Filter to those where NO timeline events have sources
  const needsFix: Incident[] = [];
  for (const inc of incidents) {
    const events = parseTimeline(inc.timeline);
    if (events.length === 0) continue;
    const hasSources = events.some((e) => e.sources && e.sources.length > 0);
    if (!hasSources) {
      needsFix.push(inc);
    }
  }

  console.log(`Found ${incidents.length} incidents with timelines, ${needsFix.length} need source attribution\n`);

  let totalFixed = 0;

  for (let i = 0; i < needsFix.length; i += BATCH_SIZE) {
    const batch = needsFix.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, needsFix.length);
    process.stdout.write(`Batch ${i + 1}-${batchEnd} / ${needsFix.length}... `);

    const batchInput = batch.map((inc) => ({
      id: inc.id,
      headline: inc.headline,
      events: parseTimeline(inc.timeline),
      sourceUrls: getSourceUrls(inc),
    }));

    const results = await attributeBatch(batchInput);
    console.log(`${results.size} attributed`);

    for (const [id, events] of results) {
      const inc = batch.find((b) => b.id === id);
      if (!inc) continue;

      const sourcesCount = events.filter((e) => e.sources && e.sources.length > 0).length;
      console.log(`  #${id}: ${sourcesCount}/${events.length} events attributed - "${(inc.headline ?? "").slice(0, 60)}"`);

      if (!DRY_RUN) {
        const serialized = JSON.stringify(events);
        await client.query(
          `UPDATE "Incident" SET timeline = $1 WHERE id = $2`,
          [serialized, id]
        );
      }
      totalFixed++;
    }
  }

  await client.end();
  console.log(`\nDone: ${totalFixed} incidents updated${DRY_RUN ? " (DRY RUN)" : ""}`);
}

main().catch(console.error);
