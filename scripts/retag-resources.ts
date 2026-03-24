/**
 * Retroactively apply "Resources" tag to incidents that are legal guides,
 * know-your-rights resources, toolkits, legal aid info, etc.
 *
 * Run: npx tsx scripts/retag-resources.ts [--dry-run]
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

  const prompt = `You are classifying immigration enforcement incidents. For each incident below, determine if it is primarily a RESOURCE, GUIDE, or TOOLKIT rather than a news story about a specific event.

An incident should be tagged "Resources" if it is about:
- Know-your-rights guides or information (e.g., "What to do if ICE comes to your door", "Know your rights during an immigration raid")
- Legal aid directories or contact info (e.g., "list of immigration lawyers", "free legal help for immigrants")
- Toolkits or action guides (e.g., "how to prepare a family safety plan", "rapid response network toolkit")
- How-to guides for dealing with ICE or immigration enforcement (e.g., "how to file a complaint against ICE", "steps to take if a family member is detained")
- Resource pages or compilations of helpful links, hotlines, or organizations
- Community preparedness guides (e.g., "ICE raid preparedness checklist", "emergency plan for undocumented families")
- Legal explainers about immigration rights, procedures, or protections
- Templates for legal documents (power of attorney, emergency custody, etc.)
- Information about legal defense funds or bail funds

Do NOT tag as Resources if:
- The story is primarily a news report about a specific detention, raid, or deportation event
- The story is about policy changes or statistics (even if it mentions rights)
- The story is about a protest or community action (not a guide)
- Legal information is only mentioned briefly as context in a news story
- The story is an opinion piece or editorial rather than a practical guide

Return a JSON array of incident IDs (as numbers) that should be tagged "Resources". Only include IDs that clearly qualify. Return ONLY the JSON array, no other text.

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

  // Load all COMPLETE incidents that don't already have Resources tag
  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND headline IS NOT NULL
       AND ("incidentType" IS NULL OR "incidentType" NOT LIKE '%Resources%')
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

    const resourceIds = await classifyBatch(batch);
    console.log(`${resourceIds.size} tagged as Resources`);

    for (const id of resourceIds) {
      const incident = batch.find((inc) => inc.id === id);
      if (!incident) continue;

      const existingTags = (incident.incidentType ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Skip if already tagged
      if (existingTags.includes("Resources")) continue;

      // Add Resources tag
      const newTags = [...existingTags, "Resources"];
      const merged = newTags.join(", ");

      console.log(
        `  #${id}: [+Resources] "${(incident.headline ?? "").slice(0, 70)}"`
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
    `\nDone: ${totalTagged} incidents tagged as Resources${DRY_RUN ? " (DRY RUN)" : ""}`
  );
}

main().catch(console.error);
