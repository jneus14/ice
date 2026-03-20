import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ========================================
  // COMBINE DYLAN LOPEZ CONTRERAS INCIDENTS
  // ========================================
  // IDs: 173, 1688, 2236, 2238, 2780
  // Keep 2236 as primary (most altSources, uses full name)

  const dylanIds = [173, 1688, 2236, 2238, 2780];
  const dylanPrimary = 2236;
  const dylanDelete = dylanIds.filter((id) => id !== dylanPrimary);

  // Collect all URLs from all incidents
  const dylanRows = await client.query(
    `SELECT id, url, "altSources" FROM "Incident" WHERE id = ANY($1)`,
    [dylanIds]
  );

  const dylanUrls: string[] = [];
  let dylanPrimaryUrl = "";
  for (const row of dylanRows.rows) {
    if (row.id === dylanPrimary) {
      dylanPrimaryUrl = row.url;
    } else {
      dylanUrls.push(row.url);
    }
    if (row.altSources) {
      try {
        const parsed = JSON.parse(row.altSources);
        dylanUrls.push(...parsed);
      } catch {}
    }
  }

  // Deduplicate, exclude primary URL
  const allDylanAlt = [...new Set(dylanUrls)].filter(
    (u) => u !== dylanPrimaryUrl
  );

  const dylanHeadline =
    "Dylan Lopez Contreras: Bronx High School Student Detained by ICE for 10 Months, Released After Asylum Denial";

  const dylanSummary = `Dylan Lopez Contreras, a Venezuelan high school student at Ellis Preparatory Academy in the Bronx, was detained by ICE on May 1, 2025 while attending an immigration court hearing in New York City. He was transferred to the Moshannon Valley Processing Center in Pennsylvania, where he was held for nearly 10 months.

In September 2025, an immigration judge denied his asylum claim, leaving him facing deportation to Venezuela. His case drew significant media attention as he was one of the first high school students detained by ICE in New York. Advocates and legal organizations rallied for his release, highlighting his status as a minor and his ties to the New York community.

On March 18, 2026, Contreras was released from ICE custody after nearly 10 months of detention. His case became a symbol of the human cost of immigration enforcement on young people and students, prompting protests and advocacy from educators, classmates, and immigration rights organizations.`;

  const dylanTags =
    "Detained, Detention Conditions, Minor/Family, Student, Court Process Issue, Refugee/Asylum Seeker";

  await client.query(
    `UPDATE "Incident"
     SET headline = $1, summary = $2, "incidentType" = $3,
         "altSources" = $4, date = $5, location = $6, country = $7
     WHERE id = $8`,
    [
      dylanHeadline,
      dylanSummary,
      dylanTags,
      JSON.stringify(allDylanAlt),
      "5/1/2025",
      "New York, NY",
      "Venezuela",
      dylanPrimary,
    ]
  );

  await client.query(`DELETE FROM "Incident" WHERE id = ANY($1)`, [
    dylanDelete,
  ]);

  console.log(
    `✓ Combined ${dylanIds.length} Dylan Lopez Contreras incidents into ID ${dylanPrimary}`
  );
  console.log(`  Deleted IDs: ${dylanDelete.join(", ")}`);
  console.log(`  Alt sources: ${allDylanAlt.length} URLs`);

  // ========================================
  // COMBINE ESTEFANY RODRIGUEZ FLOREZ INCIDENTS
  // ========================================
  // IDs: 785, 793, 2189, 2761
  // Keep 785 as primary (already updated by fix-estefany.ts, has 10 altSources)
  // DO NOT touch IDs 48, 1515, 2451 — different people

  const estefanyIds = [785, 793, 2189, 2761];
  const estefanyPrimary = 785;
  const estefanyDelete = estefanyIds.filter((id) => id !== estefanyPrimary);

  const estefanyRows = await client.query(
    `SELECT id, url, "altSources" FROM "Incident" WHERE id = ANY($1)`,
    [estefanyIds]
  );

  const estefanyUrls: string[] = [];
  let estefanyPrimaryUrl = "";
  for (const row of estefanyRows.rows) {
    if (row.id === estefanyPrimary) {
      estefanyPrimaryUrl = row.url;
    } else {
      estefanyUrls.push(row.url);
    }
    if (row.altSources) {
      try {
        const parsed = JSON.parse(row.altSources);
        estefanyUrls.push(...parsed);
      } catch {}
    }
  }

  const allEstefanyAlt = [...new Set(estefanyUrls)].filter(
    (u) => u !== estefanyPrimaryUrl
  );

  const estefanyHeadline =
    "Estefany Rodriguez Florez: Colombian Nashville Journalist Detained by ICE, Released on Bond After Judge Orders";

  const estefanySummary = `Estefany María Rodríguez Flores, a Colombian reporter for Nashville Noticias — a Spanish-language TV news outlet — was detained by ICE on March 5, 2026 during a traffic stop outside a Nashville gym, surrounded by multiple federal vehicles. Rodríguez had entered the U.S. legally on a tourist visa in 2021, subsequently applied for political asylum, married a U.S. citizen, obtained a work permit, and was awaiting a green card. She had a scheduled immigration appointment 11 days after her arrest.

ICE claimed she had overstayed her tourist visa, while her attorneys disputed the agency's authorization and argued the detention violated her First and Fifth Amendment rights, suspecting it was retaliation for her coverage of ICE enforcement activities in the Nashville area. She was held at Etowah County Jail in Alabama.

A federal judge ordered ICE to explain her continued detention by March 12. Press freedom organizations including the Committee to Protect Journalists called the arrest an attack on the free press. On March 16, an immigration judge granted her bond, but the government initially appealed the decision. A GoFundMe for her legal defense raised nearly $8,000 within days.

On March 19, 2026, Rodríguez was released on bond after her legal team secured a favorable ruling. Her case drew national attention as a test of whether immigration enforcement could be used to target journalists covering ICE activities.`;

  const estefanyTags =
    "Detained, Detention Conditions, Visa / Legal Status, Court Process Issue, Officer Misconduct";

  await client.query(
    `UPDATE "Incident"
     SET headline = $1, summary = $2, "incidentType" = $3,
         "altSources" = $4, date = $5, location = $6, country = $7
     WHERE id = $8`,
    [
      estefanyHeadline,
      estefanySummary,
      estefanyTags,
      JSON.stringify(allEstefanyAlt),
      "3/5/2026",
      "Nashville, TN",
      "Colombia",
      estefanyPrimary,
    ]
  );

  await client.query(`DELETE FROM "Incident" WHERE id = ANY($1)`, [
    estefanyDelete,
  ]);

  console.log(
    `\n✓ Combined ${estefanyIds.length} Estefany Rodriguez Florez incidents into ID ${estefanyPrimary}`
  );
  console.log(`  Deleted IDs: ${estefanyDelete.join(", ")}`);
  console.log(`  Alt sources: ${allEstefanyAlt.length} URLs`);

  await client.end();
  console.log("\nDone!");
}

main().catch(console.error);
