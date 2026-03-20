// @ts-nocheck
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, status, headline FROM "Incident" WHERE id >= 1741 ORDER BY id`
  );

  const counts = { COMPLETE: 0, FAILED: 0, PROCESSING: 0, RAW: 0 };
  for (const r of rows) {
    counts[r.status as keyof typeof counts]++;
  }

  console.log(`Status summary (${rows.length} total):`);
  console.log(`  COMPLETE:   ${counts.COMPLETE}`);
  console.log(`  PROCESSING: ${counts.PROCESSING}`);
  console.log(`  RAW:        ${counts.RAW}`);
  console.log(`  FAILED:     ${counts.FAILED}`);

  const failed = rows.filter(r => r.status === 'FAILED');
  const processing = rows.filter(r => r.status === 'PROCESSING' || r.status === 'RAW');

  if (processing.length) {
    console.log(`\nStill processing: ${processing.map(r => `#${r.id}`).join(', ')}`);
  }
  if (failed.length) {
    console.log(`\nFailed IDs: ${failed.map(r => `#${r.id}`).join(', ')}`);
  }

  await client.end();
}

main();
export {};
