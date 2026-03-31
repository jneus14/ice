/**
 * Backfill enforcement setting tags on existing incidents.
 * Reads headline + summary and classifies where the enforcement took place.
 * Only processes incidents (not policy/resources).
 *
 * Run: npx tsx scripts/backfill-enforcement-settings.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 25;

const SETTING_TAGS = [
  "Court/USCIS",
  "Airport",
  "Workplace",
  "School",
  "Church/Place of Worship",
  "Hospital/Medical",
  "Home/Residence",
  "Jail/Prison",
  "Public Space/Street",
  "Immigration Office",
  "Shelter",
] as const;

type SettingTag = (typeof SETTING_TAGS)[number];

type Incident = {
  id: number;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function classifyBatch(
  incidents: Incident[]
): Promise<Record<number, SettingTag[]>> {
  const incidentText = incidents
    .map(
      (inc) =>
        `ID ${inc.id}:\n  Headline: ${inc.headline ?? "(none)"}\n  Summary: ${inc.summary ?? "(none)"}`
    )
    .join("\n\n");

  const prompt = `You are reviewing immigration enforcement incidents. For each incident below, identify WHERE the enforcement action took place based on the headline and summary.

ENFORCEMENT SETTING tags — apply only when clearly indicated:
- "Court/USCIS": Arrest at or near a courthouse, during a court hearing, or while attending court
- "Airport": Arrest or detention at an airport, during travel, or at a port of entry
- "Workplace": Arrest at a workplace, during a workplace raid, or job site
- "School": Arrest at or near a school, college, university, or while dropping off/picking up children
- "Church/Place of Worship": Arrest at or near a church, mosque, synagogue, or other place of worship, or at a faith-based shelter
- "Hospital/Medical": Arrest at or near a hospital, clinic, medical facility, or while seeking medical care
- "Home/Residence": Arrest at someone's home, residence, apartment, or while answering the door
- "Jail/Prison": ICE detainer or pickup from local jail, prison, or after release from criminal custody
- "Public Space/Street": Arrest on the street, in a park, parking lot, store, or other public place
- "Immigration Office": Arrest during an immigration check-in, at an ICE/USCIS office, or during a scheduled appointment
- "Shelter": Arrest at or near a migrant shelter, homeless shelter, or temporary housing facility

Be conservative. Only apply when the setting is clearly stated or strongly implied. Many incidents won't have a clear setting — return an empty array for those.

Return a JSON object where keys are incident IDs (as strings) and values are arrays of applicable setting tags. Only include incidents where at least one tag applies. Return ONLY the JSON object.

Example: {"123": ["Court/USCIS"], "456": ["Home/Residence", "Public Space/Street"]}

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
    const parsed: Record<string, string[]> = JSON.parse(
      text.slice(objStart, objEnd + 1)
    );
    const result: Record<number, SettingTag[]> = {};
    for (const [idStr, tags] of Object.entries(parsed)) {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      const validTags = tags.filter((t): t is SettingTag =>
        (SETTING_TAGS as readonly string[]).includes(t)
      );
      if (validTags.length > 0) result[id] = validTags;
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

  // Load incidents that are NOT policy/resources
  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND headline IS NOT NULL
       AND approved = true
       AND ("incidentType" NOT LIKE '%Policy/Stats%' OR "incidentType" IS NULL)
       AND ("incidentType" NOT LIKE '%Resources%' OR "incidentType" IS NULL)
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents (excluding policy/resources)\n`);

  const settingTagSet = new Set<string>(SETTING_TAGS);
  let totalTagged = 0;
  let totalUpdated = 0;

  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, incidents.length);
    process.stdout.write(`Batch ${i + 1}–${batchEnd} / ${incidents.length}... `);

    const tagsToApply = await classifyBatch(batch);
    const matchCount = Object.keys(tagsToApply).length;
    console.log(`${matchCount} to tag`);

    for (const [idNum, newTags] of Object.entries(tagsToApply)) {
      const id = Number(idNum);
      const incident = batch.find((inc) => inc.id === id);
      if (!incident) continue;

      const existingTags = (incident.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Only add tags that aren't already there
      const toAdd = newTags.filter(
        (t) => !existingTags.includes(t) && settingTagSet.has(t)
      );
      if (toAdd.length === 0) continue;

      const mergedTags = [...existingTags, ...toAdd].join(", ");

      console.log(
        `  [${id}] +${toAdd.join(", ")} → ${incident.headline?.slice(0, 60)}...`
      );

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`,
          [mergedTags, id]
        );
      }

      totalTagged += toAdd.length;
      totalUpdated++;
    }
  }

  console.log(
    `\nDone. ${totalUpdated} incidents updated, ${totalTagged} tags added.${DRY_RUN ? " (DRY RUN)" : ""}`
  );

  await client.end();
}

main().catch(console.error);
