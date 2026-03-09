/**
 * Add a second batch of Instagram URLs to the database and process them.
 * Usage: npx tsx scripts/add-instagram-batch2.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../src/lib/db";
import { processInstagramPipeline } from "../src/lib/instagram-pipeline";

const URLS = `
https://www.instagram.com/p/DUz-xk1lPsQ/
https://www.instagram.com/p/DVnDMpsFKEa/
https://www.instagram.com/p/DUnzPqTkQL_/
https://www.instagram.com/p/DVm-iuqDP3D/
https://www.instagram.com/p/DVmMKPZksKP/
https://www.instagram.com/p/DVlY6-bDYOm/
https://www.instagram.com/p/DVXaMOqEXoG/
https://www.instagram.com/p/DU3Wjvakcra/
https://www.instagram.com/p/DVmLLbHAcNL/
https://www.instagram.com/p/DVj7928gZat/
https://www.instagram.com/p/DVZXs4Bmhqq/
https://www.instagram.com/p/DVjIr14EQkG/
https://www.instagram.com/p/DVjqB8qkoVe/
https://www.instagram.com/p/DVjhVRGDf_4/
https://www.instagram.com/p/DVkbZNpFpx6/
https://www.instagram.com/p/DVedDIMlDc2/
https://www.instagram.com/p/DVj_cesD-qT/
https://www.instagram.com/p/DVhtWy6jT74/
https://www.instagram.com/p/DVhUf6dkdEn/
https://www.instagram.com/p/DVe-fZxiUdp/
https://www.instagram.com/p/DVS2WYMF6yw/
https://www.instagram.com/p/DVhuqSYEbNi/
https://www.instagram.com/p/DVceiWgjXV_/
https://www.instagram.com/p/DVMDEgMESU0/
https://www.instagram.com/p/DVcTLU8lA6_/
https://www.instagram.com/p/DVZamwIgbS4/
https://www.instagram.com/p/DVeDgjJlCIl/
https://www.instagram.com/p/DVdC1k6lj8J/
https://www.instagram.com/p/DVcJiOxjDlq/
https://www.instagram.com/p/DUu4H0MlAVe/
https://www.instagram.com/p/DVL9OE-DLmr/
https://www.instagram.com/p/DVWUW34Ap7s/
https://www.instagram.com/p/DVHNSzGjPvG/
https://www.instagram.com/p/DVApzXEDOXD/
https://www.instagram.com/p/DVbf1zPkRYD/
https://www.instagram.com/p/DTTGgBSDs3Y/
https://www.instagram.com/p/DUqRZWlkZ9v/
https://www.instagram.com/p/DVG_ua8EeEm/
https://www.instagram.com/p/DUthaLTEiTk/
https://www.instagram.com/p/DVPGGsDkX5x/
https://www.instagram.com/p/DUv7yfhjseR/
https://www.instagram.com/p/DU_sCHdFhff/
https://www.instagram.com/p/DUl3UEUEiWQ/
https://www.instagram.com/p/DUbyUQGEYoc/
https://www.instagram.com/p/DVBGUdtD3Ip/
https://www.instagram.com/p/DVSEjJIj8-l/
https://www.instagram.com/p/DVRo9_LEuNk/
https://www.instagram.com/p/DUrGTm6FD6H/
https://www.instagram.com/p/DVGqoudkUwP/
https://www.instagram.com/p/DVO7N8RlE3Q/
https://www.instagram.com/p/DVRaYUyAT7r/
https://www.instagram.com/p/DU_orhIFff_/
https://www.instagram.com/p/DVHBaMMiAJS/
https://www.instagram.com/p/DU0knCBFcJx/
https://www.instagram.com/p/DVGwi7-kYT6/
https://www.instagram.com/p/DU73MauloL1/
https://www.instagram.com/p/DVJ9V-8EYB1/
https://www.instagram.com/p/DVJcHNJkQ-5/
https://www.instagram.com/p/DVUEOYsksDu/
https://www.instagram.com/p/DU_noaukjaR/
https://www.instagram.com/p/DVSQxG5kX2V/
https://www.instagram.com/p/DVS7NT3Fa0a/
https://www.instagram.com/p/DU8Zk3olcmv/
https://www.instagram.com/p/DVMl9sXgBGW/
https://www.instagram.com/p/DVIA3hgkd-7/
https://www.instagram.com/p/DVEoj2-k8EZ/
https://www.instagram.com/p/DU_0mCtCqUe/
https://www.instagram.com/p/DVGw7hVkV1u/
https://www.instagram.com/p/DVAOdRnFj3b/
https://www.instagram.com/p/DVMELVpEm4T/
https://www.instagram.com/p/DVEUC4plPx7/
https://www.instagram.com/p/DVHafkqDMOQ/
https://www.instagram.com/p/DVCVcoqFDAi/
https://www.instagram.com/p/DVIcd4vDg85/
https://www.instagram.com/p/DU9Rakckqw8/
https://www.instagram.com/p/DVAdauTkW6E/
https://www.instagram.com/p/DVRiVbciXVx/
https://www.instagram.com/p/DVSJucOkhv-/
https://www.instagram.com/p/DT08A99k6jE/
https://www.instagram.com/p/DUdjpl2gjNu/
https://www.instagram.com/p/DU6h2FPEhn9/
https://www.instagram.com/p/DU6pd4-icI7/
https://www.instagram.com/p/DUrzbjdjMyt/
https://www.instagram.com/p/DU4UbIzgBm1/
https://www.instagram.com/p/DUcC5rbmOFx/
https://www.instagram.com/p/DU4FB8tGb8o/
https://www.instagram.com/p/DUHOI-nDuwN/
https://www.instagram.com/p/DU4EV_hEnQD/
https://www.instagram.com/p/DU4LvmjCew4/
https://www.instagram.com/p/DU3jlpFCZJA/
https://www.instagram.com/p/DUmH4MxCQhx/
https://www.instagram.com/p/DU3iA-SjyQe/
https://www.instagram.com/p/DU3xKwACTS0/
https://www.instagram.com/p/DU4MS2jCcKl/
https://www.instagram.com/p/DU2mm1OlMq5/
https://www.instagram.com/p/DUjp99fj9-F/
https://www.instagram.com/p/DUjZwqEFBYK/
https://www.instagram.com/p/DUy0oK3mQts/
https://www.instagram.com/p/DTP34wejeCb/
https://www.instagram.com/p/DUyldhnia4t/
https://www.instagram.com/p/DUx1D0Gkgfj/
https://www.instagram.com/p/DU1TbPaFKrm/
https://www.instagram.com/p/DUDsnnKgpgZ/
https://www.instagram.com/p/DUn8EGSjON6/
https://www.instagram.com/p/DUwWKjRmUte/
https://www.instagram.com/p/DUOOYZfD4aT/
https://www.instagram.com/p/DUbgmFnkc9K/
https://www.instagram.com/p/DUxQb2UDQTS/
https://www.instagram.com/p/DTgT0OWkz5K/
https://www.instagram.com/p/DUt_eK0DNaC/
https://www.instagram.com/p/DUBr9S0iW1g/
https://www.instagram.com/p/DUuNF1dDAgG/
https://www.instagram.com/p/DTtH5B7kmR2/
https://www.instagram.com/p/DT3X_3ljDFA/
https://www.instagram.com/p/DUbKZPwjsIj/
https://www.instagram.com/p/DUYohj_EUSy/
https://www.instagram.com/p/DUB4EWCkYeH/
https://www.instagram.com/p/DT6HIh_FkKe/
https://www.instagram.com/p/DTgPnNekkbI/
https://www.instagram.com/p/DUUBXuKlHrb/
https://www.instagram.com/p/DUWPtYXiV0A/
https://www.instagram.com/p/DUtmmpakkZ2/
https://www.instagram.com/p/DUjbEbaEnp9/
https://www.instagram.com/p/DUoRu2BGWYX/
https://www.instagram.com/p/DUmcKEAkYv2/
https://www.instagram.com/p/DUebCDpjY4p/
https://www.instagram.com/p/DUkMbgzEURI/
https://www.instagram.com/p/DUlX580EW37/
https://www.instagram.com/p/DUoRA7BDxPp/
https://www.instagram.com/p/DUmCYVyEltm/
https://www.instagram.com/p/DUpWwL1lAoU/
https://www.instagram.com/p/DUpWUQ2EURD/
https://www.instagram.com/p/DUoOpvpgbTA/
https://www.instagram.com/p/DUl66pmDy_L/
https://www.instagram.com/p/DSFDgvIDAIg/
https://www.instagram.com/p/DUo32e1GE9N/
https://www.instagram.com/p/DUqammyjQqx/
https://www.instagram.com/p/DUll1iyDszL/
https://www.instagram.com/p/DRfHkswEd8G/
https://www.instagram.com/p/DUqe67qknD9/
https://www.instagram.com/p/DUnvlZpjGBB/
https://www.instagram.com/p/DR7ZBBdEQ4w/
https://www.instagram.com/p/DUJ8CqfAXGO/
`.trim();

const CONCURRENCY = 3;

async function pLimit(tasks: (() => Promise<void>)[], concurrency: number) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) await tasks[i++]();
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  const rawUrls = URLS.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));

  // Normalize: strip query params, deduplicate
  const urls = [...new Set(rawUrls.map((u) => {
    try {
      const parsed = new URL(u);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return u;
    }
  }))];

  console.log(`\n📋 ${urls.length} unique URLs to process\n`);

  // Check which already exist
  const existing = await prisma.incident.findMany({
    where: { url: { in: urls } },
    select: { url: true, id: true, status: true },
  });
  const existingUrls = new Set(existing.map((e) => e.url));

  const newUrls = urls.filter((u) => !existingUrls.has(u));
  console.log(`  Already in DB: ${existing.length}`);
  console.log(`  New to add:    ${newUrls.length}\n`);

  // Create new RAW incidents
  if (newUrls.length > 0) {
    await prisma.incident.createMany({
      data: newUrls.map((url) => ({ url, status: "RAW" })),
    });
    console.log(`  ✅ Created ${newUrls.length} new RAW incidents\n`);
  }

  // Fetch all IDs to process (new ones + any existing that are RAW/FAILED)
  const toProcess = await prisma.incident.findMany({
    where: {
      url: { in: urls },
      OR: [{ status: "RAW" }, { status: "FAILED" }],
    },
    select: { id: true, url: true },
    orderBy: { id: "asc" },
  });

  if (toProcess.length === 0) {
    console.log("All incidents already processed. Done.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📱 Processing ${toProcess.length} incidents (${CONCURRENCY} concurrent)...\n`);

  let done = 0;
  let succeeded = 0;
  let failed = 0;

  const tasks = toProcess.map(({ id, url }) => async () => {
    const n = ++done;
    try {
      await processInstagramPipeline(id);
      const inc = await prisma.incident.findUnique({ where: { id }, select: { headline: true } });
      succeeded++;
      console.log(`  ✅ [${n}/${toProcess.length}] #${id} ${inc?.headline || "(no headline)"}`);
    } catch (err: any) {
      failed++;
      console.error(`  ❌ [${n}/${toProcess.length}] #${id} FAILED: ${err.message?.slice(0, 80)}`);
    }
  });

  await pLimit(tasks, CONCURRENCY);

  console.log(`\n🏁 Done: ${succeeded} succeeded, ${failed} failed out of ${toProcess.length}.\n`);

  if (failed > 0) {
    const stillFailed = await prisma.incident.findMany({
      where: { url: { in: urls }, status: "FAILED" },
      select: { id: true, url: true, errorMessage: true },
    });
    console.log("Still failing:");
    stillFailed.forEach((inc) => {
      console.log(`  #${inc.id}  ${inc.url}`);
      console.log(`         → ${inc.errorMessage}`);
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
