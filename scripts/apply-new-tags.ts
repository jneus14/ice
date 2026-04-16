/**
 * Scan all incidents and apply new tags:
 *
 * New PERSON_IMPACTED tags:
 *   "DACA"                - DACA recipients / Dreamers
 *   "Student"             - students (K-12, college, university)
 *   "LGBTQ+"              - LGBTQ+ individuals
 *   "Person with Disability" - people with physical/mental disabilities
 *
 * New INCIDENT_TYPE tags:
 *   "Injury/Illness/Medical" - physical injury, illness, inadequate medical care in detention
 *   "Climate/Environmental"  - extreme heat/cold, pests, natural disasters, environmental conditions in detention
 *
 * Run: npx tsx scripts/apply-new-tags.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 25;

const NEW_TAGS = [
  "DACA",
  "Student",
  "LGBTQ+",
  "Person with Disability",
  "Injury/Illness/Medical",
  "Climate/Environmental",
] as const;

type NewTag = (typeof NEW_TAGS)[number];

type Incident = {
  id: number;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function classifyBatch(
  incidents: Incident[]
): Promise<Record<number, NewTag[]>> {
  const incidentText = incidents
    .map(
      (inc) =>
        `ID ${inc.id}:\n  Headline: ${inc.headline ?? "(none)"}\n  Summary: ${inc.summary ?? "(none)"}`
    )
    .join("\n\n");

  const prompt = `You are reviewing immigration enforcement incidents. For each incident below, identify which of these NEW tags apply based ONLY on the headline and summary text.

NEW TAGS — apply only when clearly indicated:

Person Impacted tags:
- "DACA": Person is a DACA recipient or Dreamer
- "Student": Person is a student (K-12, college, university, or explicitly described as studying)
- "LGBTQ+": Person is LGBTQ+ (explicitly mentioned)
- "Person with Disability": Person has a physical or mental disability (explicitly mentioned)

Incident Type tags:
- "Injury/Illness/Medical": Incident involves physical injury, illness, medical emergency, inadequate medical care, death from medical neglect, or health conditions in detention
- "Climate/Environmental": Incident involves extreme heat, excessive cold, pests/insects/vermin, flooding, natural disasters, or similar environmental/climate conditions (typically in detention or during enforcement)

Be conservative. Only apply a tag when the evidence is clear in the headline or summary. Do NOT guess or infer beyond what is stated.

Return a JSON object where keys are incident IDs (as strings) and values are arrays of applicable new tags from the list above. Only include incidents where at least one new tag applies. Return ONLY the JSON object, no other text.

Example: {"123": ["DACA", "Injury/Illness/Medical"], "456": ["Climate/Environmental"]}

INCIDENTS:
${incidentText}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  // Extract JSON object from response
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart === -1 || objEnd === -1) return {};

  try {
    const parsed: Record<string, string[]> = JSON.parse(
      text.slice(objStart, objEnd + 1)
    );
    // Validate tags and convert to Record<number, NewTag[]>
    const result: Record<number, NewTag[]> = {};
    for (const [idStr, tags] of Object.entries(parsed)) {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      const validTags = tags.filter((t): t is NewTag =>
        (NEW_TAGS as readonly string[]).includes(t)
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

  // Load all COMPLETE incidents with a headline
  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE status = 'COMPLETE' AND headline IS NOT NULL
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents\n`);

  // Build set of NEW_TAGS for quick lookup
  const newTagSet = new Set(NEW_TAGS);

  let totalTagged = 0;
  let totalUpdated = 0;

  // Process in batches
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

      // Get existing tags (excluding any new tags already present)
      const existingTags = (incident.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Only add tags that aren't already there
      const toAdd = newTags.filter((t) => !existingTags.includes(t));
      if (toAdd.length === 0) continue;

      const merged = [...existingTags, ...toAdd].join(", ");
      console.log(
        `  #${id}: +[${toAdd.join(", ")}] → "${incident.headline?.slice(0, 60)}"`
      );

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`,
          [merged, id]
        );
      }
      totalTagged += toAdd.length;
      totalUpdated++;
    }
  }

  await client.end();
  console.log(
    `\nDone: ${totalUpdated} incidents updated, ${totalTagged} new tag applications${DRY_RUN ? " (DRY RUN)" : ""}`
  );
}

main().catch(console.error);
