import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";
import { readFileSync } from "fs";

const FAILED_IDS = [1078,1147,1148,1149,1165,1279,1393,1408,1457,1460,1473];
const clean = (s: any) => typeof s === "string" ? s.replace(/\x00/g, "") : s;

async function main() {
  const all = JSON.parse(readFileSync(resolve(__dirname, "../prisma/sqlite-export.json"), "utf8"));
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  for (const id of FAILED_IDS) {
    const inc = all.find((i: any) => i.id === id);
    if (!inc) continue;
    await pg.query(
      `INSERT INTO "Incident" (id,url,"altSources",date,"parsedDate",location,latitude,longitude,
        headline,summary,"incidentType",country,status,"rawHtml","errorMessage","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET "rawHtml"=EXCLUDED."rawHtml"`,
      [inc.id, clean(inc.url), clean(inc.altSources), clean(inc.date),
       inc.parsedDate ? new Date(inc.parsedDate) : null,
       clean(inc.location), inc.latitude, inc.longitude,
       clean(inc.headline), clean(inc.summary), clean(inc.incidentType), clean(inc.country),
       clean(inc.status), clean(inc.rawHtml), clean(inc.errorMessage),
       new Date(inc.createdAt), new Date(inc.updatedAt)]
    );
    console.log(`Fixed #${id}`);
  }

  await pg.query(`SELECT setval('"Incident_id_seq"', (SELECT MAX(id) FROM "Incident"))`);
  console.log("Done.");
  await pg.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
