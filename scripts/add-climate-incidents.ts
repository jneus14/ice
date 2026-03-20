/**
 * Add climate/environmental incidents found in March 2026 research pass.
 * Categories: heat/cold in detention, deportation flight conditions,
 * climate refugees in enforcement, deportees to disaster zones,
 * environmental hazards in facilities, enforcement during/after climate disasters.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../src/lib/db";
import { processIncidentPipeline } from "../src/lib/pipeline";

const RAW_URLS = `
https://www.france24.com/en/americas/20250126-brazil-outraged-after-us-deportees-arrive-handcuffed-colombia-to-refuse-us-deportation-flights
https://prospect.org/labor/2025-02-18-undocumented-workers-clean-up-la-fires-ice-raids/
https://lapublicpress.org/2025/06/ice-immigrant-eaton-fire/
https://www.pbs.org/newshour/nation/as-hurricane-season-collides-with-immigration-agenda-fears-increase-for-those-without-legal-status
https://www.texastribune.org/2025/06/16/texas-operation-lone-star-border-el-paso-deaths-migrants-new-mexico/
https://www.washingtonpost.com/climate-environment/interactive/2025/ice-detention-extreme-heat/
https://www.hrw.org/report/2025/07/21/you-feel-like-your-life-is-over/abusive-practices-at-three-florida-immigration
https://prospect.org/politics/2025/11/17/ice-airs-sloppy-dangerous-deportation-flights/
https://www.kpbs.org/news/border-immigration/2025/10/06/another-immigrant-dies-in-ice-custody-in-california-this-time-in-the-imperial-valley
https://www.npr.org/2025/12/15/nx-s1-5591459/former-prison-ice-detention-centers-conditions
https://imprintnews.org/top-stories/worms-bugs-and-mold-conditions-for-detained-immigrant-children-worsen-under-trump/271341
https://haitiantimes.com/2025/02/05/first-21-haitians-deported-under-trump/
https://publichealthwatch.org/2025/08/17/el-paso-heat-climate-migrants/
https://www.chicagotribune.com/2025/08/21/hurricane-season-immigration-agenda/
https://law.justia.com/cases/federal/appellate-courts/ca1/23-1910/23-1910-2024-07-01.html
https://refugeerights.org/news-resources/danger-by-design-how-climate-injustice-harms-displaced-people-at-the-u-s-mexico-border
`.trim();

const SKIP_DOMAINS = ["instagram.com", "tiktok.com"];
const CONCURRENCY = 3;

function stripUtm(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return rawUrl;
  }
}

async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = { status: "fulfilled", value: await tasks[idx]() };
      } catch (e: any) {
        results[idx] = { status: "rejected", reason: e };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  const urls = RAW_URLS.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((u) => !SKIP_DOMAINS.some((d) => u.includes(d)))
    .map(stripUtm);

  console.log(`\n📋 ${urls.length} URLs to process\n`);

  const existing = await prisma.incident.findMany({ select: { url: true } });
  const existingSet = new Set(existing.map((e) => e.url));

  const newUrls = urls.filter((u) => !existingSet.has(u));
  const skipped = urls.length - newUrls.length;

  console.log(`  Already in DB:  ${skipped}`);
  console.log(`  New to add:     ${newUrls.length}\n`);

  if (newUrls.length === 0) {
    console.log("Nothing to add. Done.");
    await prisma.$disconnect();
    return;
  }

  const created: number[] = [];
  for (const url of newUrls) {
    const inc = await prisma.incident.create({ data: { url, status: "RAW" } });
    created.push(inc.id);
    console.log(`  ✅ Created #${inc.id}: ${url.slice(0, 80)}`);
  }

  console.log(`\n🔄 Running pipeline on ${created.length} incidents (${CONCURRENCY} concurrent)...\n`);

  let done = 0;
  const tasks = created.map((id) => async () => {
    try {
      await processIncidentPipeline(id);
      done++;
      console.log(`  ✅ [${done}/${created.length}] #${id} complete`);
    } catch (err: any) {
      console.error(`  ❌ [${done}/${created.length}] #${id} FAILED: ${err.message}`);
    }
  });

  await pLimit(tasks, CONCURRENCY);

  const succeeded = await prisma.incident.count({
    where: { id: { in: created }, status: "COMPLETE" },
  });
  const failed = await prisma.incident.count({
    where: { id: { in: created }, status: "FAILED" },
  });

  console.log(`\n🏁 Done: ${succeeded} succeeded, ${failed} failed out of ${created.length} new incidents.\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
