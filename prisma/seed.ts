import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

async function main() {
  const csv = readFileSync("data.csv", "utf-8");
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let created = 0;
  let skipped = 0;

  for (const row of records as Record<string, string>[]) {
    const url = row.link?.trim();
    if (!url) {
      skipped++;
      continue;
    }

    const hasData = row.headline || row.summary || row.incident_type;

    try {
      await prisma.incident.upsert({
        where: { url },
        update: {},
        create: {
          url,
          altSources: row.alt_source || null,
          date: row.date || null,
          location: row.location || null,
          headline: row.headline || null,
          summary: row.summary || null,
          incidentType: row.incident_type || null,
          country: row.country_of_origin || null,
          status: hasData ? "COMPLETE" : "RAW",
        },
      });
      created++;
    } catch (e) {
      console.error(`Failed to insert ${url}:`, e);
      skipped++;
    }
  }

  console.log(`Seeded ${created} incidents, skipped ${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
