/**
 * Strip "Family Separation" from incidentType on all rows.
 * Usage: pnpm tsx scripts/strip-family-separation.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const rows = await prisma.incident.findMany({
    where: { incidentType: { contains: "Family Separation" } },
    select: { id: true, incidentType: true },
  });

  console.log(`Found ${rows.length} rows with "Family Separation" tag`);

  let updated = 0;
  for (const row of rows) {
    const tags = (row.incidentType ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => t !== "Family Separation");
    const next = tags.length > 0 ? tags.join(", ") : null;
    if (next === row.incidentType) continue;
    await prisma.incident.update({
      where: { id: row.id },
      data: { incidentType: next },
    });
    updated++;
  }

  console.log(`Updated ${updated} rows`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
