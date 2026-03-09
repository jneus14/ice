/**
 * Backfill year for incident dates that only have M/D (no year).
 * Rule: use createdAt as reference — if M/D in the createdAt year would be
 * in the future relative to createdAt, use the previous year.
 * All years must be 2025 or 2026.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { prisma } from "../src/lib/db";

async function main() {
  const incidents = await prisma.incident.findMany({
    where: { date: { not: null } },
    select: { id: true, date: true, parsedDate: true, createdAt: true },
  });

  // Find M/D dates (no year)
  const noYear = incidents.filter((i) => /^\d{1,2}\/\d{1,2}$/.test(i.date!));
  console.log(`\nFound ${noYear.length} incidents with M/D dates (no year)\n`);

  let updated = 0;
  let skipped = 0;

  for (const inc of noYear) {
    const [m, d] = inc.date!.split("/").map(Number);

    // Try year of createdAt first
    const refYear = inc.createdAt.getFullYear();
    const candidateDate = new Date(refYear, m - 1, d);

    // If candidate is after createdAt, step back one year
    const year = candidateDate > inc.createdAt ? refYear - 1 : refYear;

    // Validate year is 2025 or 2026
    if (year !== 2025 && year !== 2026) {
      console.log(`  ⚠️  #${inc.id} ${inc.date} → inferred year ${year}, skipping`);
      skipped++;
      continue;
    }

    const newDate = `${m}/${d}/${year}`;
    const parsedDate = new Date(year, m - 1, d, 12, 0, 0);

    await prisma.incident.update({
      where: { id: inc.id },
      data: { date: newDate, parsedDate },
    });

    console.log(`  ✅ #${inc.id}  ${inc.date} → ${newDate}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
