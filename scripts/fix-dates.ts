/**
 * Fix dates for incidents in the database:
 * 1. PENDING incidents with NULL dates - determine correct date from URL/headline/summary
 * 2. Incidents with dates before January 2025 - verify and fix incorrect dates
 *
 * Run: npx tsx scripts/fix-dates.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const BATCH_SIZE = 15;

type Incident = {
  id: number;
  url: string | null;
  headline: string | null;
  summary: string | null;
  date: string | null;
  status: string | null;
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseIncidentDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

type DateResult = { id: number; date: string | null };

async function determineDatesBatch(
  incidents: Incident[]
): Promise<DateResult[]> {
  const incidentText = incidents
    .map(
      (inc) =>
        `ID ${inc.id}:
  URL: ${inc.url ?? "(none)"}
  Headline: ${inc.headline ?? "(none)"}
  Summary: ${(inc.summary ?? "(none)").slice(0, 400)}
  Current date: ${inc.date ?? "NULL"}`
    )
    .join("\n\n");

  const prompt = `You are determining the correct date for immigration enforcement incidents. For each incident below, determine the most likely date when the incident occurred or was reported.

CLUES TO USE:
- URL date patterns like /2025/03/15/ or /20250315/ or ?date=2025-03-15 are STRONG signals
- Dates mentioned in the headline (e.g., "March 15 raid", "arrested on Feb 3")
- Dates mentioned in the summary
- If a URL contains a year/month/day path segment, use that
- Most of these incidents are from 2025 (Jan-March 2025 primarily)
- If you cannot determine a date with reasonable confidence, return null for that incident

Return a JSON array of objects with "id" (number) and "date" (string in M/D/YYYY format, or null if unknown).

Example: [{"id": 123, "date": "3/15/2025"}, {"id": 456, "date": null}]

Return ONLY the JSON array, no other text.

INCIDENTS:
${incidentText}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) return [];

  try {
    const parsed: DateResult[] = JSON.parse(text.slice(arrStart, arrEnd + 1));
    return parsed.filter(
      (r) =>
        typeof r.id === "number" &&
        (r.date === null || typeof r.date === "string")
    );
  } catch {
    console.warn("  Failed to parse JSON response:", text.slice(0, 200));
    return [];
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── Task 1: PENDING incidents with NULL dates ──
  console.log("=== Task 1: PENDING incidents with NULL dates ===\n");

  const { rows: pendingNullDate } = await client.query<Incident>(
    `SELECT id, url, headline, summary, date, status
     FROM "Incident"
     WHERE status = 'PENDING'
       AND date IS NULL
     ORDER BY id`
  );
  console.log(`Found ${pendingNullDate.length} PENDING incidents with NULL dates\n`);

  let task1Updated = 0;

  for (let i = 0; i < pendingNullDate.length; i += BATCH_SIZE) {
    const batch = pendingNullDate.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, pendingNullDate.length);
    process.stdout.write(
      `Batch ${i + 1}-${batchEnd} / ${pendingNullDate.length}... `
    );

    const results = await determineDatesBatch(batch);
    const withDates = results.filter((r) => r.date !== null);
    console.log(`${withDates.length} dates determined`);

    for (const result of withDates) {
      const incident = batch.find((inc) => inc.id === result.id);
      if (!incident || !result.date) continue;

      const parsedDate = parseIncidentDate(result.date);
      console.log(
        `  #${result.id}: date=${result.date} "${(incident.headline ?? "").slice(0, 70)}"`
      );

      await client.query(
        `UPDATE "Incident" SET date = $1, "parsedDate" = $2 WHERE id = $3`,
        [result.date, parsedDate, result.id]
      );
      task1Updated++;
    }
  }

  console.log(`\nTask 1 complete: ${task1Updated} incidents updated\n`);

  // ── Task 2: Incidents with dates before January 2025 ──
  console.log("=== Task 2: Incidents with dates before January 2025 ===\n");

  const { rows: oldDateIncidents } = await client.query<Incident>(
    `SELECT id, url, headline, summary, date, status
     FROM "Incident"
     WHERE date IS NOT NULL
       AND "parsedDate" < '2025-01-01'
     ORDER BY id`
  );
  console.log(`Found ${oldDateIncidents.length} incidents with dates before Jan 2025\n`);

  let task2Updated = 0;

  for (let i = 0; i < oldDateIncidents.length; i += BATCH_SIZE) {
    const batch = oldDateIncidents.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, oldDateIncidents.length);
    process.stdout.write(
      `Batch ${i + 1}-${batchEnd} / ${oldDateIncidents.length}... `
    );

    const results = await determineDatesBatch(batch);
    const changed = results.filter(
      (r) => r.date !== null && r.date !== batch.find((b) => b.id === r.id)?.date
    );
    console.log(`${changed.length} dates corrected`);

    for (const result of changed) {
      const incident = batch.find((inc) => inc.id === result.id);
      if (!incident || !result.date) continue;

      const parsedDate = parseIncidentDate(result.date);
      console.log(
        `  #${result.id}: ${incident.date} -> ${result.date} "${(incident.headline ?? "").slice(0, 70)}"`
      );

      await client.query(
        `UPDATE "Incident" SET date = $1, "parsedDate" = $2 WHERE id = $3`,
        [result.date, parsedDate, result.id]
      );
      task2Updated++;
    }
  }

  await client.end();
  console.log(
    `\nTask 2 complete: ${task2Updated} incidents updated`
  );
  console.log(`\nTotal: ${task1Updated + task2Updated} incidents updated`);
}

main().catch(console.error);
