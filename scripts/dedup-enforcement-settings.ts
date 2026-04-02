/**
 * Deduplicate enforcement settings: each incident should have at most 1.
 * Uses Claude to pick the single best enforcement setting based on headline + summary.
 *
 * Rules:
 * - Hospital/Medical: ONLY if enforcement action happened AT the hospital, NOT if person
 *   ended up in hospital after being detained somewhere else.
 * - Jail/Prison: ONLY if person was picked up via ICE detainer after serving a sentence,
 *   or turned over to ICE by law enforcement. NOT if they were just booked into jail after arrest.
 * - Pick the setting where the initial enforcement encounter/arrest took place.
 *
 * Run: npx tsx scripts/dedup-enforcement-settings.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 20;

const ENFORCEMENT_TAGS = [
  "Court/USCIS/Immigration Office",
  "Airport",
  "Workplace",
  "School",
  "Church/Place of Worship",
  "Hospital/Medical",
  "Home/Residence",
  "Jail/Prison",
  "Vehicle/Traffic Stop",
  "Public Space/Street",
  "Shelter",
] as const;

const enforcementSet = new Set<string>(ENFORCEMENT_TAGS);

type Incident = {
  id: number;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function pickBestSetting(
  incidents: Incident[]
): Promise<Record<number, string>> {
  const incidentText = incidents
    .map((inc) => {
      const tags = (inc.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => enforcementSet.has(t));
      return `ID ${inc.id}:\n  Headline: ${inc.headline ?? "(none)"}\n  Summary: ${inc.summary ?? "(none)"}\n  Current tags: [${tags.join(", ")}]`;
    })
    .join("\n\n");

  const prompt = `You are reviewing immigration enforcement incidents that currently have MULTIPLE enforcement setting tags. Your job is to pick the SINGLE BEST enforcement setting for each — the place where the initial enforcement encounter/arrest actually happened.

RULES:
- Pick exactly ONE enforcement setting per incident, or "none" if none of the current tags are accurate.
- "Hospital/Medical": ONLY use if the enforcement action (arrest/detention) happened AT a hospital or medical facility. If the person was arrested elsewhere and later ended up in a hospital, do NOT use Hospital/Medical — use the setting where they were actually arrested.
- "Jail/Prison": ONLY use if ICE picked up the person via a detainer after they served a criminal sentence, or if local law enforcement turned them over to ICE. Do NOT use if the person was simply booked into jail after being arrested by ICE at another location.
- Focus on WHERE the initial encounter/arrest took place, not where the person ended up afterward.
- "Vehicle/Traffic Stop" vs "Public Space/Street": Use Vehicle/Traffic Stop only if there was an actual traffic stop. Use Public Space/Street for parking lots, stores, streets where the person was approached on foot.

ENFORCEMENT SETTINGS:
- "Court/USCIS/Immigration Office": Courthouse, court hearing, immigration check-in, ICE/USCIS office, scheduled appointment
- "Airport": Airport, port of entry, during travel
- "Workplace": Workplace, workplace raid, job site
- "School": School, college, university
- "Church/Place of Worship": Church, mosque, synagogue, faith-based shelter
- "Hospital/Medical": Hospital, clinic, medical facility (only if arrested THERE)
- "Home/Residence": Home, residence, apartment
- "Jail/Prison": ICE detainer pickup from jail/prison, turned over by law enforcement
- "Vehicle/Traffic Stop": Traffic stop, vehicle checkpoint
- "Public Space/Street": Street, park, parking lot, store, public place
- "Shelter": Migrant shelter, homeless shelter, temporary housing

Return a JSON object where keys are incident IDs (as strings) and values are the single best tag (a string), or "none" if no tag fits. Return ONLY the JSON object.

Example: {"123": "Court/USCIS/Immigration Office", "456": "Home/Residence", "789": "none"}

INCIDENTS:
${incidentText}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart === -1 || objEnd === -1) return {};

  try {
    const parsed: Record<string, string> = JSON.parse(
      text.slice(objStart, objEnd + 1)
    );
    const result: Record<number, string> = {};
    for (const [idStr, tag] of Object.entries(parsed)) {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      if (tag === "none" || enforcementSet.has(tag)) {
        result[id] = tag;
      }
    }
    return result;
  } catch {
    console.warn("  Failed to parse JSON response:", text.slice(0, 200));
    return {};
  }
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN — no changes will be written.\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Load all approved incidents
  const { rows: allIncidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE headline IS NOT NULL AND approved = true
     ORDER BY id`
  );

  // Filter to those with multiple enforcement settings
  const multiEnf = allIncidents.filter((inc) => {
    const tags = (inc.incidentType ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => enforcementSet.has(t));
    return tags.length > 1;
  });

  console.log(`Found ${multiEnf.length} incidents with multiple enforcement settings\n`);

  let totalUpdated = 0;

  for (let i = 0; i < multiEnf.length; i += BATCH_SIZE) {
    const batch = multiEnf.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, multiEnf.length);
    process.stdout.write(`Batch ${i + 1}–${batchEnd} / ${multiEnf.length}... `);

    const picks = await pickBestSetting(batch);
    console.log(`${Object.keys(picks).length} classified`);

    for (const [idNum, bestTag] of Object.entries(picks)) {
      const id = Number(idNum);
      const incident = batch.find((inc) => inc.id === id);
      if (!incident) continue;

      const allTags = (incident.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Remove all enforcement tags, then add back just the best one
      const nonEnf = allTags.filter((t) => !enforcementSet.has(t));
      if (bestTag !== "none") {
        nonEnf.push(bestTag);
      }
      const newValue = nonEnf.join(", ");

      const oldEnf = allTags.filter((t) => enforcementSet.has(t));
      console.log(
        `  [${id}] [${oldEnf.join(", ")}] → ${bestTag === "none" ? "(removed)" : bestTag} — ${incident.headline?.slice(0, 70)}`
      );

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`,
          [newValue, id]
        );
      }

      totalUpdated++;
    }
  }

  console.log(
    `\nDone. ${totalUpdated} incidents updated.${DRY_RUN ? " (DRY RUN)" : ""}`
  );

  await client.end();
}

main().catch(console.error);
