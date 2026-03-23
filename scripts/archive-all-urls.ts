import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WAYBACK_SAVE = "https://web.archive.org/save/";
const SOCIAL = ["instagram.com", "tiktok.com", "facebook.com", "threads.net"];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveToWayback(url: string): Promise<boolean> {
  try {
    const res = await fetch(WAYBACK_SAVE + url, {
      headers: {
        "User-Agent": "HumanImpactProject/1.0 (https://hiproject.org; archival)",
      },
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });
    return res.ok || res.status === 302;
  } catch {
    return false;
  }
}

async function main() {
  const incidents = await prisma.incident.findMany({
    where: { headline: { not: null }, status: "COMPLETE" },
    select: { id: true, url: true, altSources: true },
    orderBy: { id: "asc" },
  });

  // Collect all unique non-social URLs
  const allUrls = new Set<string>();
  for (const inc of incidents) {
    if (!SOCIAL.some((s) => inc.url.includes(s))) {
      allUrls.add(inc.url);
    }
    try {
      const alts = JSON.parse(inc.altSources ?? "[]");
      if (Array.isArray(alts)) {
        for (const u of alts) {
          if (typeof u === "string" && !SOCIAL.some((s) => u.includes(s))) {
            allUrls.add(u);
          }
        }
      }
    } catch {}
  }

  console.log(`Total unique non-social URLs to archive: ${allUrls.size}\n`);

  let archived = 0;
  let failed = 0;
  const urls = Array.from(allUrls);

  for (let i = 0; i < urls.length; i++) {
    const ok = await saveToWayback(urls[i]);
    if (ok) {
      archived++;
    } else {
      failed++;
    }

    if (i % 50 === 49) {
      console.log(
        `Progress: ${i + 1}/${urls.length} (${archived} archived, ${failed} failed)`
      );
    }

    // Wayback Machine rate limit: ~15 requests per minute for anonymous users
    await sleep(4000);
  }

  console.log(
    `\nDone. Archived: ${archived}, Failed: ${failed}, Total: ${urls.length}`
  );
  await prisma.$disconnect();
}

main().catch(console.error);
