import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname || process.cwd(), ".env.local") });

import { prisma } from "./src/lib/db";
import { processInstagramPipeline } from "./src/lib/instagram-pipeline";

const TARGET_IDS = [137, 210, 218, 220, 225, 226, 245, 247];

async function main() {
  console.log(`\nReprocessing ${TARGET_IDS.length} Instagram incidents with missing headlines...\n`);

  // First reset them to RAW so pipeline will run
  await prisma.incident.updateMany({
    where: { id: { in: TARGET_IDS } },
    data: { status: "RAW", errorMessage: null },
  });

  let succeeded = 0;
  let failed = 0;

  for (const id of TARGET_IDS) {
    try {
      await processInstagramPipeline(id);
      const inc = await prisma.incident.findUnique({ where: { id }, select: { headline: true } });
      console.log(`  ✅ #${id} → ${inc?.headline || "(no headline)"}`);
      succeeded++;
    } catch (err: any) {
      console.error(`  ❌ #${id} FAILED: ${err.message?.slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed.\n`);
  await prisma.$disconnect();
}

main().catch(console.error);
