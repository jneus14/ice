import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";
import Exa from "exa-js";

const prisma = new PrismaClient();
const exa = new Exa(process.env.EXA_API_KEY!);

const SOCIAL_DOMAINS = [
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "threads.net",
  "reddit.com",
  "youtube.com",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const incidents = await prisma.incident.findMany({
    where: {
      headline: { not: null },
      status: "COMPLETE",
      OR: [{ altSources: null }, { altSources: "[]" }, { altSources: "" }],
    },
    select: { id: true, headline: true, url: true },
    orderBy: { id: "desc" },
  });

  console.log(`Searching alt sources for ${incidents.length} single-source incidents...\n`);

  let updated = 0;
  let totalSources = 0;

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    try {
      const results = await exa.search(inc.headline!, {
        numResults: 5,
        type: "keyword",
        excludeDomains: SOCIAL_DOMAINS,
      });

      const newsUrls = (results.results || [])
        .filter(
          (r) =>
            r.url &&
            r.url !== inc.url &&
            !SOCIAL_DOMAINS.some((d) => r.url.includes(d))
        )
        .map((r) => r.url);

      if (newsUrls.length > 0) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { altSources: JSON.stringify(newsUrls) },
        });
        updated++;
        totalSources += newsUrls.length;
      }
    } catch (e: any) {
      if (e.message?.includes("429") || e.message?.includes("rate")) {
        console.log("Rate limited, waiting 3s...");
        await sleep(3000);
        i--; // retry
        continue;
      } else {
        console.error(`[${inc.id}] Error: ${e.message?.substring(0, 80)}`);
      }
    }

    if (i % 50 === 49) {
      console.log(
        `Progress: ${i + 1}/${incidents.length} (${updated} updated, ${totalSources} sources)`
      );
      await sleep(1000);
    } else {
      await sleep(300);
    }
  }

  console.log(
    `\nDone. Updated ${updated}/${incidents.length} with ${totalSources} total alt sources.`
  );
  await prisma.$disconnect();
}

main().catch(console.error);
