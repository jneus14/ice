/**
 * Delete clearly garbage new incidents created by the audit script:
 * forum posts, PDFs, dead shortlinks, etc.
 * Only targets incidents with id >= 936 (created during the audit) with status=RAW.
 *
 * Usage:
 *   npx tsx scripts/cleanup-garbage-incidents.ts --dry-run
 *   npx tsx scripts/cleanup-garbage-incidents.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

// Patterns that indicate a URL is not a legitimate news article about an ICE incident
const GARBAGE_PATTERNS = [
  "babycenter.com",
  "gofundme.com",
  "gofund.me",
  "/sites/default/files",  // Government PDFs
  "storage.courtlistener.com/pdf",
  "ift.tt/",       // IFTTT redirect (dead links)
  "dlvr.it/",
  "buff.ly/",
  "bit.ly/",
  "ow.ly/",
  "aol.com/articles", // AOL aggregator junk
  "newser.com",       // Aggregator
  "cdn.newser.com",
];

async function main() {
  const incidents = await prisma.incident.findMany({
    where: { id: { gte: 936 }, status: "RAW" },
    select: { id: true, url: true },
  });

  const garbage = incidents.filter((i) =>
    GARBAGE_PATTERNS.some((p) => i.url.includes(p))
  );

  console.log(`Total new RAW incidents (id>=936): ${incidents.length}`);
  console.log(`Garbage to delete: ${garbage.length}${DRY_RUN ? " [DRY RUN]" : ""}`);
  console.log();

  for (const inc of garbage) {
    console.log(`  #${inc.id}: ${inc.url}`);
    if (!DRY_RUN) {
      await prisma.incident.delete({ where: { id: inc.id } });
    }
  }

  if (!DRY_RUN) {
    console.log(`\nDeleted ${garbage.length} garbage incidents.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
