import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { prisma } from "../src/lib/db";

async function main() {
  const totalAll = await prisma.incident.count();
  const withHeadline = await prisma.incident.count({ where: { headline: { not: null } } });
  const withCoords = await prisma.incident.count({
    where: { headline: { not: null }, latitude: { not: null }, longitude: { not: null } },
  });
  const byStatus = await prisma.incident.groupBy({ by: ["status"], _count: { id: true } });

  console.log(`\nDB Status:`);
  console.log(`  Total incidents:        ${totalAll}`);
  console.log(`  With headline:          ${withHeadline}`);
  console.log(`  With coords + headline: ${withCoords}`);
  console.log(`\nBy status:`);
  byStatus.forEach((s) => console.log(`  ${s.status}: ${s._count.id}`));

  await prisma.$disconnect();
}
main();
