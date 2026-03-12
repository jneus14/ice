/**
 * One-time migration: copy all incidents from local SQLite dev.db → Railway PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Requires both SQLITE_DATABASE_URL (source) and DATABASE_URL (postgres target) to be set.
 */
import { config } from "dotenv";
import { resolve } from "path";
// Load .env.local first (has SQLite DATABASE_URL)
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient as SqliteClient } from "@prisma/client";
import { Client as PgClient } from "pg";

const PG_URL = process.env.PG_DATABASE_URL;
if (!PG_URL) {
  console.error("Set PG_DATABASE_URL to your Railway PostgreSQL external URL");
  process.exit(1);
}

async function main() {
  // Read from local SQLite
  const sqlite = new SqliteClient();
  const incidents = await sqlite.incident.findMany({ orderBy: { id: "asc" } });
  console.log(`Read ${incidents.length} incidents from SQLite`);
  await sqlite.$disconnect();

  // Write to PostgreSQL
  const pg = new PgClient({ connectionString: PG_URL });
  await pg.connect();

  // Create table if not exists (prisma migrate deploy should have done this)
  console.log("Inserting into PostgreSQL...");
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
          inc.id,
          inc.url,
          inc.altSources,
          inc.date,
          inc.parsedDate,
          inc.location,
          inc.latitude,
          inc.longitude,
          inc.headline,
          inc.summary,
          inc.incidentType,
          inc.country,
          inc.status,
          inc.rawHtml,
          inc.errorMessage,
          inc.createdAt,
          inc.updatedAt,
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  Failed #${inc.id}: ${err.message}`);
      skipped++;
    }

    if (inserted % 100 === 0) console.log(`  ${inserted}/${incidents.length}...`);
  }

  // Reset the auto-increment sequence so new incidents get correct IDs
  await pg.query(
    `SELECT setval('"Incident_id_seq"', (SELECT MAX(id) FROM "Incident"))`
  );

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
