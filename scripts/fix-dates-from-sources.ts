import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPublishDate(url: string): Promise<Date | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();

    // Try multiple date extraction methods
    const patterns = [
      // JSON-LD datePublished
      /"datePublished"\s*:\s*"([^"]+)"/,
      /"dateCreated"\s*:\s*"([^"]+)"/,
      // meta tags
      /property="article:published_time"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="article:published_time"/,
      /name="date"\s+content="([^"]+)"/,
      /name="publish.date"\s+content="([^"]+)"/,
      /name="pubdate"\s+content="([^"]+)"/,
      // time element
      /<time[^>]+datetime="([^"]+)"/,
      // Open Graph
      /property="og:updated_time"\s+content="([^"]+)"/,
    ];

    for (const pat of patterns) {
      const match = html.match(pat);
      if (match) {
        const d = new Date(match[1]);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2024 && d <= new Date()) {
          return d;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function main() {
  // Find incidents where date is likely wrong (set from createdAt)
  const all = await prisma.incident.findMany({
    where: {
      headline: { not: null },
      status: "COMPLETE",
    },
    select: {
      id: true,
      headline: true,
      url: true,
      altSources: true,
      date: true,
      parsedDate: true,
      createdAt: true,
    },
    orderBy: { id: "desc" },
  });

  const suspects = all.filter((inc) => {
    if (!inc.parsedDate) return true;
    const diff = Math.abs(inc.parsedDate.getTime() - inc.createdAt.getTime());
    return diff < 2 * 86400000;
  });

  console.log(`Checking ${suspects.length} incidents with suspicious dates...\n`);

  let fixed = 0;
  for (let i = 0; i < suspects.length; i++) {
    const inc = suspects[i];

    // Collect all URLs
    const urls = [inc.url];
    try {
      const alts = JSON.parse(inc.altSources ?? "[]");
      if (Array.isArray(alts)) urls.push(...alts);
    } catch {}

    // Skip social media URLs, try news URLs first
    const newsUrls = urls.filter(
      (u) =>
        !u.includes("instagram.com") &&
        !u.includes("twitter.com") &&
        !u.includes("facebook.com") &&
        !u.includes("tiktok.com")
    );

    let bestDate: Date | null = null;

    // Try up to 3 news URLs
    for (const url of newsUrls.slice(0, 3)) {
      const d = await fetchPublishDate(url);
      if (d) {
        if (!bestDate || d > bestDate) bestDate = d;
        break; // Use the first date we find
      }
      await sleep(300);
    }

    if (bestDate) {
      const formatted = `${bestDate.getMonth() + 1}/${bestDate.getDate()}/${bestDate.getFullYear()}`;
      if (formatted !== inc.date) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { date: formatted, parsedDate: bestDate },
        });
        fixed++;
        console.log(
          `[${inc.id}] ${inc.date} -> ${formatted} | ${inc.headline?.substring(0, 55)}`
        );
      }
    }

    if (i % 50 === 49)
      console.log(
        `\nProgress: ${i + 1}/${suspects.length} (${fixed} fixed)\n`
      );
  }

  console.log(`\nFixed dates for ${fixed}/${suspects.length} incidents`);
  await prisma.$disconnect();
}

main().catch(console.error);
