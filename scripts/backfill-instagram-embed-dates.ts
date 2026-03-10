/**
 * For Instagram incidents missing dates, fetch the embed page and extract
 * the "taken_at_timestamp" Unix timestamp that Instagram includes in the HTML.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { prisma } from "../src/lib/db";
import { parseIncidentDate } from "../src/lib/geocode";

const CONCURRENCY = 5;
const DELAY_MS = 300;

async function pLimit(tasks: (() => Promise<void>)[], concurrency: number) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const task = tasks[i++];
      await task();
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function extractDateFromEmbed(url: string): Promise<string | null> {
  try {
    const shortcode = url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[2];
    if (!shortcode) return null;

    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const html = await response.text();

    // Look for taken_at_timestamp (post publish time).
    // In the embed HTML the JSON is escaped, so the pattern is like: taken_at_timestamp\":1754513417
    const m = html.match(/taken_at_timestamp[^0-9]+(\d{9,11})/);
    if (!m) return null;

    const ts = parseInt(m[1], 10);
    const date = new Date(ts * 1000);
    if (isNaN(date.getTime())) return null;

    // Return YYYY-MM-DD
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function main() {
  const incidents = await prisma.incident.findMany({
    where: {
      url: { contains: "instagram.com" },
      date: null,
    },
    select: { id: true, url: true, headline: true },
    orderBy: { id: "asc" },
  });

  console.log(`\nFound ${incidents.length} Instagram incidents missing dates\n`);

  let done = 0;
  let updated = 0;
  let skipped = 0;

  const tasks = incidents.map((inc) => async () => {
    const n = ++done;
    try {
      const dateStr = await extractDateFromEmbed(inc.url);
      if (!dateStr) {
        skipped++;
        process.stdout.write(`  ⚠️  [${n}/${incidents.length}] #${inc.id} no date\n`);
        return;
      }

      const parsedDate = parseIncidentDate(dateStr);

      await prisma.incident.update({
        where: { id: inc.id },
        data: { date: dateStr, parsedDate: parsedDate ?? undefined },
      });

      updated++;
      console.log(
        `  ✅ [${n}/${incidents.length}] #${inc.id} → ${dateStr}  "${inc.headline?.slice(0, 60)}"`
      );
    } catch (err: any) {
      skipped++;
      console.error(
        `  ❌ [${n}/${incidents.length}] #${inc.id} error: ${err.message?.slice(0, 80)}`
      );
    }
  });

  await pLimit(tasks, CONCURRENCY);

  console.log(`\nDone: ${updated} updated, ${skipped} skipped\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
