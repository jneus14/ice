// @ts-nocheck
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

const TAG = "Climate/Environmental";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Find Alligator Alcatraz / Everglades stories that mention mosquitoes
  const { rows } = await client.query(
    `SELECT id, headline, "incidentType", summary
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND (
         headline ILIKE '%alligator%' OR summary ILIKE '%alligator%'
         OR headline ILIKE '%everglades%' OR summary ILIKE '%everglades%'
       )
       AND (summary ILIKE '%mosquito%' OR headline ILIKE '%mosquito%')
     ORDER BY id`
  );

  console.log(`Found ${rows.length} Alligator Alcatraz stories mentioning mosquitoes:`);

  for (const r of rows) {
    const current = r.incidentType || "";
    if (current.includes(TAG)) {
      console.log(`  #${r.id}: already tagged — ${r.headline?.slice(0, 70)}`);
      continue;
    }
    const updated = current ? `${current}, ${TAG}` : TAG;
    await client.query(`UPDATE "Incident" SET "incidentType" = $1 WHERE id = $2`, [updated, r.id]);
    console.log(`  #${r.id}: tagged ✓ — ${r.headline?.slice(0, 70)}`);
  }

  console.log("\nDone.");
  await client.end();
}

main();
export {};
