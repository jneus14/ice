/**
 * Review all COMPLETE incident summaries for editorializing, conclusory
 * statements, or assessments beyond the facts. Uses Claude to identify
 * and rewrite problematic summaries.
 *
 * Run: npx tsx scripts/fix-editorializing.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 10;

type Incident = {
  id: number;
  summary: string;
};

type CleanResult = {
  id: number;
  needs_edit: boolean;
  cleaned_summary: string;
  problems: string[];
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function cleanBatch(incidents: Incident[]): Promise<CleanResult[]> {
  const incidentText = incidents
    .map((inc) => `ID ${inc.id}:\n${inc.summary}`)
    .join("\n\n---\n\n");

  const prompt = `You are an editor reviewing immigration incident summaries for editorializing. Your job is to ensure summaries are strictly factual and neutral, containing no commentary, conclusions, or assessments.

FLAG and REMOVE any of the following patterns:
- "has raised questions about..."
- "drew national attention"
- "highlighted the human cost of"
- "became a symbol of"
- "sparked debate/controversy/outrage"
- "raised concerns about"
- "underscored the tensions"
- "illustrates the challenges"
- "points to broader issues"
- "remains a powerful reminder"
- "shed light on"
- "brought renewed attention to"
- "landmark case"
- "unprecedented"
- Any phrase that characterizes public reaction ("widely condemned", "controversial", "alarming")
- Any phrase that draws conclusions or assigns meaning ("this case shows...", "demonstrating the...")
- Any phrase that frames impact or significance ("in a case that...", "marking the first...")
- Emotional or dramatic framing ("harrowing", "heartbreaking", "chilling")
- Any editorial assessment of what events "mean" or "signal"

For each incident, if the summary contains editorializing:
1. Rewrite it to be strictly factual, preserving ALL facts, names, dates, locations, and events
2. Remove only the editorializing language
3. Keep the same overall structure and length where possible

Return a JSON array of objects with this shape:
{
  "id": <number>,
  "needs_edit": <boolean>,
  "cleaned_summary": "<string - the rewritten summary if needs_edit is true, or empty string if false>",
  "problems": ["<list of problematic phrases found>"]
}

Return ONLY the JSON array. No other text.

INCIDENTS:
${incidentText}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) {
    console.warn("  Failed to find JSON array in response");
    return [];
  }

  try {
    const parsed: CleanResult[] = JSON.parse(text.slice(arrStart, arrEnd + 1));
    return parsed.filter(
      (r) => r && typeof r.id === "number" && typeof r.needs_edit === "boolean"
    );
  } catch (e) {
    console.warn("  Failed to parse JSON response:", text.slice(0, 300));
    return [];
  }
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN -- no changes will be written.\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: incidents } = await client.query<Incident>(
    `SELECT id, summary
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND summary IS NOT NULL
       AND summary != ''
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents to evaluate\n`);

  let totalEdited = 0;
  const allChanges: { id: number; problems: string[]; before: string; after: string }[] = [];

  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, incidents.length);
    process.stdout.write(
      `Batch ${i + 1}-${batchEnd} / ${incidents.length}... `
    );

    let results: CleanResult[];
    try {
      results = await cleanBatch(batch);
    } catch (e: any) {
      console.warn(`API error: ${e.message}`);
      continue;
    }

    const edits = results.filter(
      (r) => r.needs_edit && r.cleaned_summary && r.cleaned_summary.length > 0
    );
    console.log(`${edits.length} need editing`);

    for (const result of edits) {
      const incident = batch.find((inc) => inc.id === result.id);
      if (!incident) continue;

      // Sanity check: cleaned summary should not be dramatically shorter
      if (result.cleaned_summary.length < incident.summary.length * 0.3) {
        console.warn(
          `  #${result.id}: Skipping -- cleaned summary too short (${result.cleaned_summary.length} vs ${incident.summary.length})`
        );
        continue;
      }

      console.log(
        `  #${result.id}: [${result.problems.join("; ")}]`
      );

      allChanges.push({
        id: result.id,
        problems: result.problems,
        before: incident.summary,
        after: result.cleaned_summary,
      });

      if (!DRY_RUN) {
        await client.query(
          `UPDATE "Incident" SET summary = $1 WHERE id = $2`,
          [result.cleaned_summary, result.id]
        );
      }
      totalEdited++;
    }
  }

  await client.end();

  // Print detailed changes
  if (allChanges.length > 0) {
    console.log("\n========== CHANGES ==========\n");
    for (const change of allChanges) {
      console.log(`--- Incident #${change.id} ---`);
      console.log(`Problems: ${change.problems.join("; ")}`);
      console.log(`BEFORE: ${change.before}`);
      console.log(`AFTER:  ${change.after}`);
      console.log();
    }
  }

  console.log(
    `\nDone: ${totalEdited} summaries edited${DRY_RUN ? " (DRY RUN)" : ""}`
  );
}

main().catch(console.error);
