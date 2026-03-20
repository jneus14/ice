import { config } from "dotenv";
import { resolve } from "path";
const envResult = config({ path: resolve(process.cwd(), ".env.local") });
// Dotenv v17+ doesn't always write to process.env, so force it
if (envResult.parsed) {
  for (const [k, v] of Object.entries(envResult.parsed)) {
    process.env[k] = v;
  }
}

import { Client } from "pg";
import Anthropic from "@anthropic-ai/sdk";

const PATTERNS = [
  "became a symbol",
  "drew national attention",
  "drew widespread",
  "drew significant",
  "highlighted the",
  "raises questions",
  "raised questions",
  "raising questions",
  "underscores the",
  "underscoring the",
  "reflects the",
  "reflecting the",
  "illustrates the",
  "illustrating the",
  "speaks to the",
  "spotlighted the",
  "spotlighting the",
  "sheds light",
  "shedding light",
  "brought attention",
  "bringing attention",
  "sparked debate",
  "sparking debate",
  "sparked outrage",
  "sparking outrage",
  "sparked concern",
  "sparking concern",
  "fueled debate",
  "fueling debate",
  "emblematic of",
  "testament to",
  "a stark reminder",
  "a chilling reminder",
  "a grim reminder",
  "a sobering reminder",
  "a powerful reminder",
  "serves as a reminder",
  "a cautionary tale",
  "sends a chilling",
  "broader pattern",
  "broader implications",
  "broader concerns",
  "growing concern",
  "growing fears",
  "growing trend",
  "mounting concern",
  "unprecedented",
  "landmark case",
  "landmark test",
  "controversial",
  "deeply troubling",
  "alarming trend",
  "alarming pattern",
  "haunting",
  "heartbreaking",
  "devastating",
  "human cost",
  "human toll",
  "ripple effect",
  "far-reaching",
  "wide-ranging",
  "galvanized",
  "galvanizing",
  "ignited a",
  "igniting a",
  "reignited",
  "reigniting",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Find all flagged summaries
  const flagged: Array<{ id: number; headline: string; summary: string }> = [];

  for (const pattern of PATTERNS) {
    const q = "%" + pattern + "%";
    const res = await client.query(
      `SELECT id, headline, summary FROM "Incident" WHERE summary ILIKE $1 AND status = 'COMPLETE'`,
      [q]
    );
    for (const row of res.rows) {
      if (!flagged.find((f) => f.id === row.id)) {
        flagged.push({
          id: row.id,
          headline: row.headline,
          summary: row.summary,
        });
      }
    }
  }

  console.log(`Found ${flagged.length} summaries to fix\n`);

  // Process in batches of 10
  const batchSize = 10;
  let fixed = 0;

  for (let i = 0; i < flagged.length; i += batchSize) {
    const batch = flagged.slice(i, i + batchSize);

    const prompt = batch
      .map(
        (f) =>
          `[ID ${f.id}]\nHeadline: ${f.headline}\nSummary: ${f.summary}\n`
      )
      .join("\n---\n\n");

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Rewrite ONLY the summaries below to remove editorializing, conclusory, or embellishing language. Keep the same facts and structure. Make minimal changes — only fix the problematic phrases.

Rules:
- Remove phrases like "became a symbol of," "drew national attention," "raised questions about," "sparked outrage/debate/concern," "highlights/underscores/illustrates the," "unprecedented," "controversial," "heartbreaking," "devastating," "broader pattern/concerns," "landmark," "a reminder," "galvanized," etc.
- Replace with factual descriptions of what happened. For example:
  - "sparked outrage" → name who responded and how
  - "raised questions about X" → remove or say "X remains unclear" if factually true
  - "unprecedented" → remove or state the specific factual comparison
  - "controversial" → just remove the word
  - "broader pattern" → state the specific facts instead
  - "highlighted the" → remove or rephrase to state the fact directly
- Do NOT add new information. Do NOT change the meaning. Just remove the editorializing.
- If a sentence is ONLY editorial with no factual content, remove it entirely.
- Keep the same paragraph structure.
- Some words like "devastating" or "unprecedented" may be used factually (e.g., "devastating wildfires" or quoting someone saying "unprecedented"). In those cases, keep them.

Return ONLY a JSON array of objects: [{"id": 123, "summary": "fixed summary text"}]
No markdown formatting, no code blocks, just the JSON.

${prompt}`,
        },
      ],
    });

    const text =
      msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    let jsonStr = text;
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }

    try {
      const results: Array<{ id: number; summary: string }> =
        JSON.parse(jsonStr);
      for (const result of results) {
        if (result.summary && result.summary !== batch.find(b => b.id === result.id)?.summary) {
          await client.query(`UPDATE "Incident" SET summary = $1 WHERE id = $2`, [
            result.summary,
            result.id,
          ]);
          fixed++;
          console.log(`  ✓ Fixed ID ${result.id}: ${batch.find(b => b.id === result.id)?.headline?.substring(0, 60)}`);
        }
      }
    } catch (e: any) {
      console.log(`  ✗ Batch parse failed: ${e.message}`);
      console.log(`  Response: ${text.substring(0, 200)}`);
    }

    // Brief pause between batches
    if (i + batchSize < flagged.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n=== Done: fixed ${fixed} of ${flagged.length} summaries ===`);
  await client.end();
}

main().catch(console.error);
