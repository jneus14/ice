/**
 * For Instagram incidents missing dates, search Exa using the headline
 * to find a matching news article and extract its published date.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import Exa from "exa-js";
import { prisma } from "../src/lib/db";
import { parseIncidentDate } from "../src/lib/geocode";
import { parseAltSources } from "../src/lib/sources";

const CONCURRENCY = 3;

async function pLimit(tasks: (() => Promise<void>)[], concurrency: number) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) await tasks[i++]();
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function findDateForIncident(
  inc: { id: number; headline: string; altSources: string | null },
  exa: Exa
): Promise<string | null> {
  // Strategy 1: use existing altSources — fetch their published dates via Exa contents
  const altUrls = parseAltSources(inc.altSources).filter(
    (u) => !u.includes("instagram.com")
  );

  if (altUrls.length > 0) {
    try {
      const contents = await (exa as any).getContents(altUrls.slice(0, 3), {
        text: { maxCharacters: 500 },
      });
      for (const r of contents.results ?? []) {
        if (r.publishedDate) return r.publishedDate;
      }
    } catch {
      // fall through to search
    }
  }

  // Strategy 2: search by headline
  try {
    const results = await (exa as any).search(
      `"${inc.headline.slice(0, 120)}"`,
      {
        numResults: 3,
        type: "news",
        excludeDomains: ["instagram.com", "facebook.com", "twitter.com", "x.com"],
        contents: { text: { maxCharacters: 500 } },
      }
    );
    for (const r of results.results ?? []) {
      if (r.publishedDate) return r.publishedDate;
    }
  } catch {
    // fall through
  }

  return null;
}

async function main() {
  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) throw new Error("EXA_API_KEY is not configured");

  const exa = new Exa(exaKey);

  const incidents = await prisma.incident.findMany({
    where: {
      url: { contains: "instagram.com" },
      headline: { not: null },
      date: null,
    },
    select: { id: true, headline: true, altSources: true },
    orderBy: { id: "asc" },
  });

  console.log(`\nFound ${incidents.length} Instagram incidents missing dates\n`);

  let done = 0;
  let updated = 0;
  let skipped = 0;

  const tasks = incidents.map((inc) => async () => {
    const n = ++done;
    try {
      const rawDate = await findDateForIncident(
        inc as { id: number; headline: string; altSources: string | null },
        exa
      );
      if (!rawDate) {
        skipped++;
        console.log(`  ⚠️  [${n}/${incidents.length}] #${inc.id} no date found`);
        return;
      }

      const parsedDate = parseIncidentDate(rawDate);
      // Use the ISO date string as the stored date (YYYY-MM-DD)
      const dateStr = rawDate.slice(0, 10);

      await prisma.incident.update({
        where: { id: inc.id },
        data: { date: dateStr, parsedDate: parsedDate ?? undefined },
      });

      updated++;
      console.log(`  ✅ [${n}/${incidents.length}] #${inc.id} → ${dateStr}  "${inc.headline?.slice(0, 60)}"`);
    } catch (err: any) {
      skipped++;
      console.error(`  ❌ [${n}/${incidents.length}] #${inc.id} error: ${err.message?.slice(0, 80)}`);
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
