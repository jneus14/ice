/**
 * Two-pass retag script:
 * 1. Apply "Family Separation" tag to incidents about families being split
 * 2. Review "Deported" tag: reclassify to "Policy/Stats" when no specific person is deported
 *
 * Run: npx tsx scripts/retag-family-separation-deported.ts [--dry-run]
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

// ── Pass 1: Family Separation ──

async function classifyFamilySeparation(incidents: Incident[]): Promise<Set<number>> {
  const text = incidents
    .map((inc) =>
      `ID ${inc.id}:\n  Headline: ${inc.headline ?? "(none)"}\n  Summary: ${(inc.summary ?? "(none)").slice(0, 500)}\n  Tags: ${inc.incidentType ?? "(none)"}`
    )
    .join("\n\n");

  const prompt = `Classify which incidents involve FAMILY SEPARATION due to immigration enforcement.

Tag as "Family Separation" if:
- A parent is detained/deported and children are left behind
- Children are separated from parents during enforcement
- Family members are split across borders due to deportation
- Children placed in foster care because parent was detained/deported
- A spouse or parent is taken and family is broken apart
- Story explicitly mentions family being separated by immigration enforcement

Do NOT tag as Family Separation if:
- An individual is detained/deported but no family separation is mentioned
- The story is about policy in general without specific families affected
- Families are mentioned but not actually separated

Return a JSON array of incident IDs that should get the "Family Separation" tag. Return ONLY the JSON array.
Example: [123, 456]
If none qualify: []

INCIDENTS:
${text}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s === -1 || e === -1) return new Set();
  try {
    return new Set((JSON.parse(raw.slice(s, e + 1)) as number[]).filter((id) => typeof id === "number"));
  } catch {
    return new Set();
  }
}

// ── Pass 2: Review Deported tag ──

async function classifyDeported(incidents: Incident[]): Promise<Set<number>> {
  const text = incidents
    .map((inc) =>
      `ID ${inc.id}:\n  Headline: ${inc.headline ?? "(none)"}\n  Summary: ${(inc.summary ?? "(none)").slice(0, 500)}`
    )
    .join("\n\n");

  const prompt = `Review these incidents that have the "Deported" tag. Determine which ones should KEEP the "Deported" tag vs be changed to "Policy/Stats".

KEEP "Deported" if:
- A specific, named or identified person is actually deported in the story
- The story focuses on a specific individual's or specific group's deportation experience
- Specific people are named who were deported (e.g., "Juan Garcia was deported to Guatemala")

CHANGE to "Policy/Stats" if:
- The story is about aggregate deportation statistics (e.g., "deportations increase 40%")
- The story is about deportation policy changes or executive orders
- The story discusses deportation trends, flight numbers, or operational data
- No specific named individual is actually deported in the story
- The story is about planned or potential deportations in general

Return a JSON array of incident IDs that should be CHANGED from "Deported" to "Policy/Stats" (i.e., the ones that are about aggregate stats/policy, NOT specific people).
Return ONLY the JSON array.
Example: [123, 456]
If none should change: []

INCIDENTS:
${text}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s === -1 || e === -1) return new Set();
  try {
    return new Set((JSON.parse(raw.slice(s, e + 1)) as number[]).filter((id) => typeof id === "number"));
  } catch {
    return new Set();
  }
}

function parseTags(incidentType: string | null): string[] {
  return (incidentType ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ═══════════════════════════════════════════
  // Pass 1: Family Separation
  // ═══════════════════════════════════════════
  console.log("═══ PASS 1: Family Separation ═══\n");

  const { rows: allIncidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND headline IS NOT NULL
       AND ("incidentType" IS NULL OR "incidentType" NOT LIKE '%Family Separation%')
     ORDER BY id`
  );
  console.log(`Evaluating ${allIncidents.length} incidents for Family Separation\n`);

  let familyTagged = 0;
  for (let i = 0; i < allIncidents.length; i += BATCH_SIZE) {
    const batch = allIncidents.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Batch ${i + 1}-${Math.min(i + BATCH_SIZE, allIncidents.length)} / ${allIncidents.length}... `);

    const ids = await classifyFamilySeparation(batch);
    console.log(`${ids.size} tagged`);

    for (const id of ids) {
      const inc = batch.find((b) => b.id === id);
      if (!inc) continue;

      const tags = parseTags(inc.incidentType);
      if (tags.includes("Family Separation")) continue;

      tags.push("Family Separation");
      const merged = tags.join(", ");

      console.log(`  #${id}: +Family Separation "${(inc.headline ?? "").slice(0, 70)}"`);

      if (!DRY_RUN) {
        await client.query(`UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`, [merged, id]);
      }
      familyTagged++;
    }
  }

  console.log(`\nFamily Separation: ${familyTagged} incidents tagged\n`);

  // ═══════════════════════════════════════════
  // Pass 2: Review Deported tag
  // ═══════════════════════════════════════════
  console.log("═══ PASS 2: Review Deported → Policy/Stats ═══\n");

  const { rows: deportedIncidents } = await client.query<Incident>(
    `SELECT id, headline, summary, "incidentType"
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND "incidentType" LIKE '%Deported%'
     ORDER BY id`
  );
  console.log(`Reviewing ${deportedIncidents.length} incidents with Deported tag\n`);

  let reclassified = 0;
  for (let i = 0; i < deportedIncidents.length; i += BATCH_SIZE) {
    const batch = deportedIncidents.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Batch ${i + 1}-${Math.min(i + BATCH_SIZE, deportedIncidents.length)} / ${deportedIncidents.length}... `);

    const toChange = await classifyDeported(batch);
    console.log(`${toChange.size} reclassified`);

    for (const id of toChange) {
      const inc = batch.find((b) => b.id === id);
      if (!inc) continue;

      let tags = parseTags(inc.incidentType);
      tags = tags.filter((t) => t !== "Deported");
      if (!tags.includes("Policy/Stats")) tags.push("Policy/Stats");
      const merged = tags.join(", ");

      console.log(`  #${id}: Deported → Policy/Stats "${(inc.headline ?? "").slice(0, 70)}"`);

      if (!DRY_RUN) {
        await client.query(`UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`, [merged, id]);
      }
      reclassified++;
    }
  }

  await client.end();
  console.log(`\nDone: ${familyTagged} Family Separation, ${reclassified} Deported→Policy/Stats${DRY_RUN ? " (DRY RUN)" : ""}`);
}

main().catch(console.error);
