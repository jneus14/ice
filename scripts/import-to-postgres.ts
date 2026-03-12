/**
 * Import incidents from sqlite-export.json into PostgreSQL.
 * Run after prisma migrate dev has created the tables.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";
import { readFileSync } from "fs";

const PG_URL = process.env.DATABASE_URL!;

async function main() {
  const incidents = JSON.parse(
    readFileSync(resolve(__dirname, "../prisma/sqlite-export.json"), "utf8")
  );
  console.log(`Importing ${incidents.length} incidents into PostgreSQL...`);

  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  let inserted = 0;
  let skipped = 0;

  for (const inc of incidents) {
    try {
      await pg.query(
        `INSERT INTO "Incident" (
          id, url, "altSources", date, "parsedDate", location, latitude, longitude,
          headline, summary, "incidentType", country, status, "rawHtml",
          "errorMessage", "createdAt", "updatedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO NOTHING`,
        [
          inc.id, inc.url, inc.altSources, inc.date,
          inc.parsedDate ? new Date(inc.parsedDate) : null,
          inc.location, inc.latitude, inc.longitude,
          inc.headline, inc.summary, inc.incidentType, inc.country,
          inc.status, inc.rawHtml, inc.errorMessage,
          new Date(inc.createdAt), new Date(inc.updatedAt),
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  ✗ #${inc.id}: ${err.message?.slice(0, 80)}`);
      skipped++;
    }
    if (inserted % 200 === 0) console.log(`  ${inserted}/${incidents.length}...`);
  }

  // Reset sequence so new incidents get correct IDs
  await pg.query(`SELECT setval('"Incident_id_seq"', (SELECT MAX(id) FROM "Incident"))`);
  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
  await pg.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
