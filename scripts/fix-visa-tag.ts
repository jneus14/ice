/**
 * Review all incidents tagged "Visa / Legal Status" and remove the tag
 * from incidents where the person did NOT have a valid, current visa/legal status.
 *
 * Run: npx tsx scripts/fix-visa-tag.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 15;

type Incident = {
  id: number;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function classifyBatch(
  incidents: Incident[]
): Promise<Set<number>> {
  const incidentText = incidents
    .map(
      (inc) =>
        `ID ${inc.id}:\n  Headline: ${inc.headline ?? "(none)"}\n  Summary: ${(inc.summary ?? "(none)").slice(0, 500)}`
    )
    .join("\n\n");

  const prompt = `You are reviewing immigration enforcement incidents that are currently tagged "Visa / Legal Status". Your job is to determine which incidents should KEEP this tag.

The "Visa / Legal Status" tag should ONLY be kept when the person had a VALID, CURRENT visa or legal status at the time of their detention or deportation. Examples of valid status:
- Active student visa (F-1, J-1, M-1)
- Active work visa (H-1B, H-2A, H-2B, L-1, O-1, TN, etc.)
- Active tourist visa (B-1/B-2)
- Active temporary protected status (TPS)
- Any other currently valid, unexpired immigration status

The tag should be REMOVED (i.e. do NOT include the ID in your response) if:
- The person overstayed their visa (expired status)
- The person is undocumented / without papers
- The person had an expired work permit
- The person has a pending asylum case (should use Refugee/Asylum tag instead)
- The person is a DACA recipient (should use DACA tag instead)
- The person is an LPR / green card holder (should use LPR tag instead)
- The story doesn't mention visa or legal status details
- The status is unclear or not specified
- The person entered without inspection

Return a JSON array of incident IDs (as numbers) that should KEEP the "Visa / Legal Status" tag — i.e., incidents where the person clearly had a valid, current visa/legal status. Return ONLY the JSON array, no other text.

Example: [123, 456]

If none should keep the tag, return: []

INCIDENTS:
${incidentText}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) return new Set();

  try {
    const parsed: number[] = JSON.parse(text.slice(arrStart, arrEnd + 1));
    return new Set(parsed.filter((id) => typeof id === "number" && !isNaN(id)));
  } catch {
    console.warn("  Failed to parse JSON response:", text.slice(0, 200));
    return new Set();
  }
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN -- no changes will be written.\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Load all incidents tagged with "Visa / Legal Status"
  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE "incidentType" LIKE '%Visa / Legal Status%'
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents tagged "Visa / Legal Status"\n`);

  let totalRemoved = 0;
  let totalKept = 0;

  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, incidents.length);
    process.stdout.write(
      `Batch ${i + 1}-${batchEnd} / ${incidents.length}... `
    );

    // classifyBatch returns IDs that should KEEP the tag
    const keepIds = await classifyBatch(batch);
    const removeCount = batch.length - keepIds.size;
    console.log(`${keepIds.size} keep, ${removeCount} remove`);

    for (const incident of batch) {
      if (keepIds.has(incident.id)) {
        totalKept++;
        continue;
      }

      // Remove "Visa / Legal Status" tag
      const existingTags = (incident.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const newTags = existingTags.filter(
        (t) => t !== "Visa / Legal Status"
      );
      const merged = newTags.length > 0 ? newTags.join(", ") : null;

      console.log(
        `  #${incident.id}: REMOVE tag — "${(incident.headline ?? "").slice(0, 80)}"`
      );

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`,
          [merged, incident.id]
        );
      }
      totalRemoved++;
    }
  }

  await client.end();
  console.log(
    `\nDone: ${totalRemoved} incidents had "Visa / Legal Status" removed, ${totalKept} kept${DRY_RUN ? " (DRY RUN)" : ""}`
  );
}

main().catch(console.error);
