/**
 * Bulk-add incidents from a list of URLs.
 * Usage: npx tsx scripts/add-incidents.ts
 *
 * - Skips Instagram / TikTok (can't scrape)
 * - Strips UTM params before de-duplication
 * - Creates RAW record, then runs the full pipeline (scrape → extract → geocode)
 * - Runs up to 3 pipelines concurrently
 */

// Load .env.local so ANTHROPIC_API_KEY etc. are available outside Next.js
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../src/lib/db";
import { processIncidentPipeline } from "../src/lib/pipeline";

const RAW_URLS = `
https://www.nytimes.com/2026/02/20/nyregion/immigration-scam-new-york.html
https://www.sfchronicle.com/politics/article/cbp-san-diego-land-parcel-21361363.php
https://www.daylightsandiego.org/before-escondido-meeting-about-ice-use-of-gun-range-documents-reveal-border-patrol-also-used-facility/
https://www.washingtonpost.com/immigration/2026/02/23/former-ice-instructor-says-agency-slashed-training-new-officers/
https://www.wfyi.org/news/articles/monthly-vigil-renews-push-to-end-ice-detention-in-indiana-after-one-immigrant-dies
https://calexicochronicle.com/2026/02/23/calexico-vigil-held-in-tribute-to-immigrants-who-died-in-ice-custody/
https://www.motherjones.com/politics/2026/02/ice-detention-keeping-not-returning-immigration-documents-work-permits/
https://sahanjournal.com/immigration/ice-minnesota-suburbs-operation-metro-surge/
https://apnews.com/article/immigration-trump-detention-bond-judge-50a5da122aa51eed77cace0830548df3
https://www.hrw.org/news/2026/02/20/abuses-in-cameroon-after-us-deports-third-country-nationals
https://apnews.com/article/trump-deportation-cameroon-morocco-lgbt-interview-1ea278f4c981df798773e26972c5d54f
https://www.oregonlive.com/news/2026/02/ive-never-met-a-finer-man-handyman-who-died-after-shock-deportation-to-mexico-built-life-in-beaverton.html
https://www.kptv.com/2026/02/21/no-one-deserves-this-beaverton-father-dies-after-deportation-mexico/
https://www.reuters.com/legal/government/priests-say-ice-contractor-geo-rejected-shareholder-vote-human-rights-review-2026-02-09/
https://www.dailynews.com/2026/02/23/it-will-drive-you-crazy-letters-reveal-what-life-is-like-inside-adelanto-ice-detention-center/
https://lapublicpress.org/2026/02/la-ice-adelanto-immigrants-detained/
https://www.investigativepost.org/2026/02/25/blind-refugee-abandoned-by-border-patrol-is-dead/
https://www.texastribune.org/2026/02/20/texas-ice-detention-death-use-of-force-camp-east-montana/
https://www.nytimes.com/2026/02/23/us/ice-shooting-texas-witness-dead.html
https://www.newsweek.com/who-was-ruben-ray-martinez-us-citizen-fatally-shot-by-ice-agent-11560138
https://www.daylightsandiego.org/officials-detain-and-cite-volunteers-documenting-ice-arrests-at-san-diego-federal-building/
https://www.daylightsandiego.org/ice-in-san-diego-is-monitoring-activists-through-operation-road-flare/
https://ictnews.org/news/north-central-bureau/four-oglala-detainees-located-three-still-in-ice-custody/
https://ictnews.org/news/i-felt-like-i-was-kidnapped-ojibwe-man-recounts-ice-detainment/
https://www.startribune.com/us-citizen-arrested-ice-day-after-fatal-shooting-renee-good-twin-cities-immigration-operation/601560460
https://apnews.com/article/immigration-protest-arrests-detention-ice-8993bfd5d54b870521ec5b44fc42cd71
https://www.instagram.com/reels/DTbeReoiO2l/
https://www.instagram.com/reels/DTd80oSk89E/
https://minnesotareformer.com/2026/01/12/u-s-border-patrol-knees-man-in-face-in-minneapolis-as-other-agents-hold-him-down/
https://www.instagram.com/reels/DTZNVRBDual/
https://www.instagram.com/reels/DTYVZQ2jbvK/
https://www.instagram.com/reels/DTgOolTgMTA/
https://www.theguardian.com/us-news/2026/jan/13/doj-attorneys-resign-minneapolis-ice-shooting
https://www.scrippsnews.com/politics/immigration/photos-and-911-calls-deepen-mystery-of-immigrants-sudden-death-in-ice-custody
https://www.freep.com/story/news/politics/2026/02/17/haley-stevens-hillary-scholten-ice-facility-baldwin-nenko-gantchev/88716198007/
https://www.wfyi.org/news/articles/ice-detainee-dies-at-miami-correctional-in-indiana
https://www.kenklippenstein.com/p/exclusive-ice-masks-up-in-more-ways
https://www.theguardian.com/us-news/2026/feb/10/los-angeles-protester-jonathon-redondo-rosales
https://www.cnn.com/2026/02/19/us/immigration-law-18-usc-111
https://www.reuters.com/world/us/ice-is-cracking-down-people-who-follow-them-their-cars-2026-02-10/
https://19thnews.org/2026/01/ice-fears-pregnant-immigrants-minnesota-prenatal-care/
https://www.propublica.org/article/dilley-detention-center-kids-art-removal
https://www.nbcnews.com/news/us-news/911-calls-kids-struggling-breathe-ice-detention-texas-immigration-rcna260595
https://abcnews.com/US/cbp-agents-coercing-unaccompanied-minors-voluntary-removal-lawyers/story?id=130492864
https://www.npr.org/2026/02/24/nx-s1-5723914/ice-iran-deporatation-adoption-adoptee-veteran
https://beta.elfaro.net/fotogaleria/en-quetzaltenango-hay-vida-despues-de-la-deportacion
https://www.theguardian.com/us-news/2026/mar/03/man-deported-tattoos-cecot-el-salvador
https://www.daylightsandiego.org/san-diego-activist-sentenced-to-45-days-home-arrest-after-pleading-guilty-to-misdemeanor-assault-of-immigration-official/
https://haitiantimes.com/2026/03/01/haitian-organization-justice-two-girls-mexico-center/
https://www.latimes.com/politics/story/2026-03-03/asylum-approvals-plummet-as-fearful-immigrants-skip-hearings
https://www.usatoday.com/story/news/world/2026/03/05/afghan-allies-qatar-camp-iran/88978889007/
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

  console.log(`\n📋 ${urls.length} URLs to process (Instagram skipped)\n`);

  // De-dupe against existing DB records
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

  // Create all RAW records first
  const created: number[] = [];
  for (const url of newUrls) {
    const inc = await prisma.incident.create({
      data: { url, status: "RAW" },
    });
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

  // Final tally
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
