/**
 * Reprocess all FAILED incidents.
 * Usage: npx tsx scripts/reprocess-failed.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../src/lib/db";
import { processIncidentPipeline } from "../src/lib/pipeline";

const CONCURRENCY = 3;

async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  const failed = await prisma.incident.findMany({
    where: { status: "FAILED" },
    select: { id: true, url: true },
    orderBy: { id: "asc" },
  });

  console.log(`\n🔄 Reprocessing ${failed.length} FAILED incidents (${CONCURRENCY} concurrent)...\n`);

  let done = 0;
  let succeeded = 0;
  let stillFailed = 0;

  const tasks = failed.map(({ id, url }) => async () => {
    const n = ++done;
    try {
      await processIncidentPipeline(id);
      succeeded++;
      console.log(`  ✅ [${n}/${failed.length}] #${id} ${url.slice(0, 70)}`);
    } catch (err: any) {
      stillFailed++;
      console.error(`  ❌ [${n}/${failed.length}] #${id} FAILED: ${err.message?.slice(0, 80)}`);
    }
  });

  await pLimit(tasks, CONCURRENCY);

  console.log(`\n🏁 Done: ${succeeded} succeeded, ${stillFailed} still failed.\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
