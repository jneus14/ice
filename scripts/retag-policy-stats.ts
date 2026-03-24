/**
 * Retroactively apply "Policy/Stats" tag to incidents that are about
 * aggregate statistics or policy changes rather than specific individual cases.
 * Also removes "Disappearance/Detention" from those incidents.
 *
 * Run: npx tsx scripts/retag-policy-stats.ts [--dry-run]
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

  const prompt = `You are classifying immigration enforcement incidents. For each incident below, determine if it is primarily about AGGREGATE STATISTICS or POLICY CHANGES rather than a specific individual case.

An incident should be tagged "Policy/Stats" if it is about:
- Aggregate numbers or statistics (e.g., "ICE arrests increase 40%", "1,000 deportation flights daily", "deportations hit record high")
- Policy announcements or changes (e.g., "Trump signs executive order", "new rule allows...", "DHS announces policy")
- Government program descriptions or analysis (e.g., "ICE expands 287(g) program", "CBP One app changes")
- Budget, funding, or resource allocation (e.g., "ICE budget increases", "new detention beds")
- Broad enforcement trends or compilations (e.g., "raids across 10 cities", "nationwide crackdown summary")
- Legislative actions (e.g., "bill introduced to...", "Senate votes on...")
- Court rulings affecting broad policy (e.g., "judge blocks deportation policy nationwide")

Do NOT tag as Policy/Stats if:
- The story is primarily about a specific named individual's detention, deportation, or experience
- The story focuses on a specific raid or enforcement action at a particular location with specific people affected
- The story is about a protest or community response to a specific incident
- Statistics are only mentioned as background context in a story about a specific case

Return a JSON array of incident IDs (as numbers) that should be tagged "Policy/Stats". Only include IDs that clearly qualify. Return ONLY the JSON array, no other text.

Example: [123, 456, 789]

If none qualify, return: []

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

  // Load all COMPLETE incidents that don't already have Policy/Stats tag
  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND headline IS NOT NULL
       AND ("incidentType" IS NULL OR "incidentType" NOT LIKE '%Policy/Stats%')
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents to evaluate\n`);

  let totalTagged = 0;

  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, incidents.length);
    process.stdout.write(
      `Batch ${i + 1}-${batchEnd} / ${incidents.length}... `
    );

    const policyIds = await classifyBatch(batch);
    console.log(`${policyIds.size} tagged as Policy/Stats`);

    for (const id of policyIds) {
      const incident = batch.find((inc) => inc.id === id);
      if (!incident) continue;

      const existingTags = (incident.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Skip if already tagged
      if (existingTags.includes("Policy/Stats")) continue;

      // Add Policy/Stats, remove Disappearance/Detention
      const newTags = existingTags.filter(
        (t) => t !== "Disappearance/Detention"
      );
      newTags.push("Policy/Stats");
      const merged = newTags.join(", ");

      const removedDetention = existingTags.includes("Disappearance/Detention");
      const changeDesc = removedDetention
        ? "+Policy/Stats, -Disappearance/Detention"
        : "+Policy/Stats";

      console.log(
        `  #${id}: [${changeDesc}] "${(incident.headline ?? "").slice(0, 70)}"`
      );

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`,
          [merged, id]
        );
      }
      totalTagged++;
    }
  }

  await client.end();
  console.log(
    `\nDone: ${totalTagged} incidents tagged as Policy/Stats${DRY_RUN ? " (DRY RUN)" : ""}`
  );
}

main().catch(console.error);
