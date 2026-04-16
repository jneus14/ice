/**
 * Backfill enforcement setting tags on incidents that are missing them.
 * Uses Claude to read the summary and determine if an enforcement setting
 * is clearly indicated.
 *
 * Run: npx tsx scripts/infer-enforcement-settings.ts [--dry-run] [--limit N] [--min-id N]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 500;
})();
const MIN_ID = (() => {
  const i = process.argv.indexOf("--min-id");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ENFORCEMENT = new Set([
  "Court/USCIS/Immigration Office",
  "Airport",
  "Vehicle/Traffic Stop",
  "Workplace",
  "School",
  "Church/Place of Worship",
  "Hospital/Medical",
  "Home/Residence",
  "Criminal/Detainer",
  "Public Space/Street",
]);

async function inferSettings(
  headline: string,
  summary: string | null,
): Promise<string[]> {
  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Based on this immigration enforcement incident, identify the ENFORCEMENT SETTING where the arrest/detention happened. Apply based on WHERE the person was physically taken into custody (the "first instance" of enforcement).

Options:
- "Court/USCIS/Immigration Office": arrested at immigration court, ICE check-in, USCIS interview, field office, courthouse
- "Airport": arrested at airport
- "Vehicle/Traffic Stop": arrested during traffic stop or while driving
- "Workplace": arrested at job site (restaurant, construction, Home Depot, etc.)
- "School": arrested at school or outside school
- "Church/Place of Worship": arrested at religious institution
- "Hospital/Medical": arrested AT a hospital/clinic (NOT when merely hospitalized after arrest)
- "Home/Residence": arrested at home/apartment
- "Criminal/Detainer": transferred from jail/prison via ICE detainer
- "Public Space/Street": arrested on street, sidewalk, parking lot, store (when no other specific setting applies)

Rules:
- Only apply settings that are CLEARLY indicated by the text. If unclear, return [].
- Multiple settings allowed if applicable.
- Do NOT include "Hospital/Medical" if the person was just hospitalized after being arrested elsewhere.

Incident:
${headline}
${summary || ""}

Return ONLY a JSON array of setting strings, e.g. ["Court/USCIS/Immigration Office"] or []. No other text.`,
      },
    ],
  });

  const text = resp.content[0].type === "text" ? resp.content[0].text.trim() : "";
  const match = text.match(/\[[^\]]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter((t: string) => ENFORCEMENT.has(t)) : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log(
    `Infer Enforcement Settings${DRY_RUN ? " (DRY RUN)" : ""}, limit: ${LIMIT}, min-id: ${MIN_ID}\n`
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{
    id: number;
    headline: string;
    summary: string | null;
    incidentType: string;
  }>(
    `
    SELECT id, headline, summary, "incidentType"
    FROM "Incident"
    WHERE status = 'COMPLETE' AND headline IS NOT NULL
      AND "incidentType" IS NOT NULL
      AND id >= $1
    ORDER BY id DESC
  `,
    [MIN_ID]
  );

  const missing = rows.filter((r) => {
    const tags = r.incidentType.split(",").map((t) => t.trim());
    return !tags.some((t) => ENFORCEMENT.has(t));
  });

  console.log(`${missing.length} incidents missing enforcement setting (of ${rows.length})\n`);

  const toProcess = missing.slice(0, LIMIT);
  let updated = 0;
  let noSetting = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const inc = toProcess[i];
    try {
      const settings = await inferSettings(inc.headline, inc.summary);
      if (settings.length === 0) {
        noSetting++;
        if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${toProcess.length}] ...`);
        continue;
      }
      const newType = `${inc.incidentType}, ${settings.join(", ")}`;
      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET "incidentType" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [newType, inc.id]
        );
      }
      console.log(
        `[${i + 1}] ${inc.id}: +[${settings.join(", ")}] — ${inc.headline.slice(0, 55)}`
      );
      updated++;
    } catch (err: any) {
      console.log(`[${i + 1}] ${inc.id}: error ${err.message?.slice(0, 60)}`);
      errors++;
    }
  }

  await client.end();

  console.log(`\n=== SUMMARY ===`);
  console.log(`Updated: ${updated}`);
  console.log(`No clear setting: ${noSetting}`);
  console.log(`Errors: ${errors}`);
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Remaining: ${missing.length - toProcess.length}`);
}

main().catch(console.error);
