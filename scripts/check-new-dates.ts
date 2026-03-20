// @ts-nocheck
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, status, headline, date, "parsedDate"
     FROM "Incident"
     WHERE id >= 1741 AND status = 'COMPLETE'
     ORDER BY id`
  );

  console.log(`${rows.length} COMPLETE incidents from batch 3:\n`);
  for (const r of rows) {
    const pd = r.parsedDate ? r.parsedDate.toISOString().slice(0, 10) : "NULL";
    console.log(`  #${r.id} parsedDate=${pd} date="${r.date}" — ${r.headline?.slice(0, 65)}`);
  }

  // Also find the Disneyland story
  const { rows: disney } = await client.query(
    `SELECT id, status, headline, date, "parsedDate"
     FROM "Incident"
     WHERE (headline ILIKE '%disney%' OR summary ILIKE '%disney%')
       AND status = 'COMPLETE'
     ORDER BY id DESC LIMIT 5`
  );
  console.log(`\n=== Disneyland story ===`);
  for (const r of disney) {
    const pd = r.parsedDate ? r.parsedDate.toISOString().slice(0, 10) : "NULL";
    console.log(`  #${r.id} parsedDate=${pd} date="${r.date}" — ${r.headline?.slice(0, 70)}`);
  }

  await client.end();
}

main();
export {};
