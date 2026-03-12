/**
 * Batch-process all RAW incidents created by the audit (id >= 936).
 * Runs the standard pipeline on each one with limited concurrency.
 *
 * Usage:
 *   npx tsx scripts/process-raw-incidents.ts              # all new RAW incidents
 *   npx tsx scripts/process-raw-incidents.ts --limit=50   # cap at 50
 *   npx tsx scripts/process-raw-incidents.ts --concurrency=3
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import { processIncidentPipeline } from "../src/lib/pipeline";

const prisma = new PrismaClient();

const LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "9999"
);
const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "3"
);
// Only process incidents created by the audit (id >= 936)
const MIN_ID = 936;

async function runBatch(ids: number[]): Promise<{ ok: number[]; failed: number[] }> {
  const ok: number[] = [];
  const failed: number[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        await processIncidentPipeline(id);
        ok.push(id);
        console.log(`  ✓ #${id}`);
      } catch (err: any) {
        failed.push(id);
        console.log(`  ✗ #${id}: ${err.message?.slice(0, 100)}`);
      }
    })
  );
  return { ok, failed };
}

async function main() {
  const incidents = await prisma.incident.findMany({
    where: { id: { gte: MIN_ID }, status: "RAW" },
    select: { id: true, url: true },
    orderBy: { id: "asc" },
    take: LIMIT,
  });

  console.log(
    `\nProcessing ${incidents.length} RAW incidents (concurrency=${CONCURRENCY})...\n`
  );

  let totalOk = 0;
  let totalFailed = 0;
  let processed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < incidents.length; i += CONCURRENCY) {
    const batch = incidents.slice(i, i + CONCURRENCY);
    const ids = batch.map((inc) => inc.id);
    console.log(
      `Batch ${Math.floor(i / CONCURRENCY) + 1}: #${ids[0]}–#${ids[ids.length - 1]} ` +
        `(${i + 1}–${Math.min(i + CONCURRENCY, incidents.length)} of ${incidents.length})`
    );
    const { ok, failed } = await runBatch(ids);
    totalOk += ok.length;
    totalFailed += failed.length;
    processed += batch.length;

    // Progress summary every 30 incidents
    if (processed % 30 === 0) {
      console.log(
        `  Progress: ${processed}/${incidents.length} — ${totalOk} ok, ${totalFailed} failed\n`
      );
    }
  }

  console.log(`\n── Final Summary ────────────────────────────────────`);
  console.log(`  Processed : ${processed}`);
  console.log(`  Succeeded : ${totalOk}`);
  console.log(`  Failed    : ${totalFailed}`);
  console.log();

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
