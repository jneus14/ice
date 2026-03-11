/**
 * Two-pass fix for Instagram incidents with bad alt sources:
 *
 * Pass 1 – Cleanup: remove social/shortlink URLs from altSources across all incidents.
 * Pass 2 – Re-process: for Instagram incidents that still have no real news alt sources,
 *           run the updated pipeline to find actual news articles.
 *
 * Usage:
 *   npx tsx scripts/fix-instagram-altsources.ts           # cleanup + re-process
 *   npx tsx scripts/fix-instagram-altsources.ts --cleanup-only  # just cleanup
 *   npx tsx scripts/fix-instagram-altsources.ts --dry-run       # preview changes
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import { processInstagramPipeline } from "../src/lib/instagram-pipeline";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const CLEANUP_ONLY = process.argv.includes("--cleanup-only");
// Re-process at most this many incidents per run to avoid burning API budget
const REPROCESS_LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "50"
);

const JUNK_DOMAINS = [
  "instagram.com",
  "instagr.am",
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "twitter.com",
  "t.co",
  "x.com",
  "threads.net",
  "dlvr.it",
  "ow.ly",
  "buff.ly",
  "bit.ly",
];

function isJunk(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return JUNK_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    // Malformed URL — substring check is safe fallback for obvious social shortlinks
    return JUNK_DOMAINS.some((d) => url.includes(d));
  }
}

async function main() {
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"} | cleanup-only: ${CLEANUP_ONLY} | re-process limit: ${REPROCESS_LIMIT}\n`
  );

  // ── Pass 1: Clean up junk altSources ──────────────────────────────────────
  console.log("=== Pass 1: Cleaning up junk altSources ===");
  const all = await prisma.incident.findMany({
    where: { altSources: { not: null } },
    select: { id: true, altSources: true, url: true },
  });

  let cleanedCount = 0;
  for (const inc of all) {
    let urls: string[] = [];
    try {
      urls = JSON.parse(inc.altSources ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(urls)) continue;

    const clean = urls.filter((u) => typeof u === "string" && !isJunk(u));
    if (clean.length !== urls.length) {
      const removed = urls.filter((u) => isJunk(u));
      console.log(
        `  #${inc.id}: removed ${removed.length} junk URL(s): ${removed.join(", ").slice(0, 100)}`
      );
      if (!DRY_RUN) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { altSources: clean.length ? JSON.stringify(clean) : null },
        });
      }
      cleanedCount++;
    }
  }
  console.log(`\nPass 1 done: ${cleanedCount} incidents cleaned.\n`);

  if (CLEANUP_ONLY) {
    await prisma.$disconnect();
    return;
  }

  // ── Pass 2: Re-process Instagram incidents with no news alt sources ────────
  console.log("=== Pass 2: Re-processing Instagram incidents missing news sources ===");

  const instagramIncidents = await prisma.incident.findMany({
    where: {
      status: "COMPLETE",
      url: { contains: "instagram.com" },
    },
    select: { id: true, url: true, headline: true, altSources: true },
    orderBy: { parsedDate: "desc" },
  });

  const needsReprocess = instagramIncidents.filter((inc) => {
    let urls: string[] = [];
    try {
      urls = JSON.parse(inc.altSources ?? "[]");
    } catch {}
    const newsUrls = urls.filter((u) => !isJunk(u));
    return newsUrls.length === 0;
  });

  console.log(
    `Found ${needsReprocess.length} Instagram incidents with no news alt sources.`
  );
  console.log(`Will re-process up to ${REPROCESS_LIMIT}.\n`);

  const toProcess = needsReprocess.slice(0, REPROCESS_LIMIT);
  let processed = 0;
  let failed = 0;

  for (const inc of toProcess) {
    console.log(`[${processed + failed + 1}/${toProcess.length}] #${inc.id}: ${inc.headline?.slice(0, 70) ?? "(no headline)"}`);
    if (DRY_RUN) {
      console.log("  [DRY RUN] Would re-process\n");
      continue;
    }
    try {
      // Reset status to COMPLETE first so pipeline will re-run
      await prisma.incident.update({
        where: { id: inc.id },
        data: { status: "RAW" },
      });
      await processInstagramPipeline(inc.id);
      processed++;
      console.log("  ✅ Done\n");
    } catch (err: any) {
      failed++;
      console.log(`  ❌ Failed: ${err.message?.slice(0, 100)}\n`);
    }
  }

  console.log(`\nPass 2 done: ${processed} re-processed, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
