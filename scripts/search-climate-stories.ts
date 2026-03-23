import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";
import Exa from "exa-js";

const prisma = new PrismaClient();
const exa = new Exa(process.env.EXA_API_KEY!);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const queries = [
  "migrant dies desert heat border 2025",
  "migrant dies desert heat border 2026",
  "immigrant death desert Arizona Texas exposure",
  "migrant body found desert border remains",
  "deportee dies heat exposure after deportation",
  "ICE detainee heat stroke dies detention",
  "migrant drowns Rio Grande river crossing 2025",
  "migrant drowns Rio Grande river crossing 2026",
  "asylum seeker dies cold exposure border crossing",
  "border crossing death environmental extreme weather",
  "deported migrant dies Guatemala Mexico desert",
  "migrant rescue desert border patrol death",
  "immigration detention heat death conditions",
  "deportation flight death medical emergency",
  "migrants die Sonoran desert Chihuahuan",
  "migrant remains found border Brooks County Texas",
  "border wall death injury environmental",
  "migrant dies river border patrol rescue",
  "deported person killed after deportation",
  "immigrants die crossing dangerous terrain border",
];

async function main() {
  const allResults: Array<{
    url: string;
    title: string;
    date: string | null;
  }> = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const res = await exa.search(q, {
        numResults: 10,
        type: "keyword",
        startPublishedDate: "2025-01-01",
        excludeDomains: [
          "instagram.com",
          "twitter.com",
          "x.com",
          "facebook.com",
          "tiktok.com",
          "reddit.com",
          "youtube.com",
        ],
      });
      for (const r of res.results || []) {
        allResults.push({
          url: r.url,
          title: r.title ?? "",
          date: r.publishedDate ?? null,
        });
      }
      console.log(`[${i + 1}/${queries.length}] "${q}" -> ${res.results?.length ?? 0} results`);
    } catch (e: any) {
      console.error(`Error on "${q}": ${e.message?.substring(0, 60)}`);
    }
    await sleep(500);
  }

  // Dedupe by URL
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  console.log(`\nTotal unique results: ${unique.length}`);

  // Check which URLs already exist in database
  const existingUrls = new Set<string>();
  const existing = await prisma.incident.findMany({
    select: { url: true, altSources: true },
  });
  for (const e of existing) {
    existingUrls.add(e.url);
    try {
      const alts = JSON.parse(e.altSources ?? "[]");
      if (Array.isArray(alts)) alts.forEach((a: string) => existingUrls.add(a));
    } catch {}
  }

  const newUrls = unique.filter((r) => !existingUrls.has(r.url));
  console.log(`Already in database: ${unique.length - newUrls.length}`);
  console.log(`New to add: ${newUrls.length}\n`);

  // Add new ones as RAW incidents
  let added = 0;
  for (const r of newUrls) {
    // Filter out non-relevant results
    const titleLower = (r.title ?? "").toLowerCase();
    const relevant =
      titleLower.includes("migrant") ||
      titleLower.includes("immigrant") ||
      titleLower.includes("border") ||
      titleLower.includes("deport") ||
      titleLower.includes("asylum") ||
      titleLower.includes("ice ") ||
      titleLower.includes("detention") ||
      titleLower.includes("desert") ||
      titleLower.includes("drown") ||
      titleLower.includes("dies") ||
      titleLower.includes("death") ||
      titleLower.includes("remains") ||
      titleLower.includes("heat") ||
      titleLower.includes("exposure") ||
      titleLower.includes("crossing");

    if (!relevant) {
      console.log(`  SKIP (not relevant): ${r.title?.substring(0, 70)}`);
      continue;
    }

    await prisma.incident.create({
      data: {
        url: r.url,
        status: "RAW",
        approved: false,
      },
    });
    added++;
    console.log(
      `  ADDED: ${r.date?.substring(0, 10) ?? "no-date"} | ${r.title?.substring(0, 70)} | ${r.url}`
    );
  }

  console.log(`\nAdded ${added} new RAW incidents. Use admin console to scrape them.`);
  await prisma.$disconnect();
}

main().catch(console.error);
