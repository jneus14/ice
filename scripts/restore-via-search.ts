import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const anthropic = new Anthropic();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchGoogle(query: string): Promise<string | null> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=3`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract first real URL from search results
    const urlMatch = html.match(/href="\/url\?q=([^&"]+)/);
    if (urlMatch) {
      return decodeURIComponent(urlMatch[1]);
    }
    // Try another pattern
    const altMatch = html.match(/class="yuRUbf".*?href="(https?:\/\/[^"]+)"/);
    if (altMatch) return altMatch[1];
    return null;
  } catch {
    return null;
  }
}

async function fetchArticle(url: string): Promise<{ title: string; text: string; date: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? "";

    // Extract date
    let date: string | null = null;
    const datePatterns = [
      /"datePublished"\s*:\s*"([^"]+)"/,
      /property="article:published_time"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="article:published_time"/,
      /<time[^>]+datetime="([^"]+)"/,
    ];
    for (const pat of datePatterns) {
      const m = html.match(pat);
      if (m) { date = m[1]; break; }
    }

    // Strip HTML for text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 3000);

    return { title, text, date };
  } catch {
    return null;
  }
}

async function main() {
  const restored = await prisma.incident.findMany({
    where: { url: { startsWith: "restored-" } },
    select: { id: true, headline: true },
  });
  console.log(`Restored posts to fix: ${restored.length}\n`);

  let fixed = 0;
  for (let i = 0; i < restored.length; i++) {
    const inc = restored[i];
    console.log(`[${inc.id}] ${inc.headline}`);

    // Search for the article
    const foundUrl = await searchGoogle(inc.headline! + " immigration ICE");
    if (!foundUrl) {
      console.log("  No URL found via search");
      await sleep(2000);
      continue;
    }

    console.log(`  Found: ${foundUrl}`);
    const article = await fetchArticle(foundUrl);
    if (!article || article.text.length < 100) {
      console.log("  Could not fetch article content");
      await sleep(2000);
      continue;
    }

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `Extract data from this article. Return ONLY valid JSON:\n{"headline":"max 15 words","date":"M/D/YYYY or null","location":"City, ST or null","summary":"2-4 factual sentences","incidentType":"tags","country":"or null"}\n\nTitle: ${article.title}\nText: ${article.text.substring(0, 2000)}`,
          },
        ],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
      let jsonStr = text;
      if (jsonStr.startsWith("```"))
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

      const data = JSON.parse(jsonStr);

      let parsedDate: Date | null = null;
      if (data.date && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(data.date)) {
        parsedDate = new Date(data.date);
        if (isNaN(parsedDate.getTime())) parsedDate = null;
      }
      if (!parsedDate && article.date) {
        parsedDate = new Date(article.date);
        if (isNaN(parsedDate.getTime())) parsedDate = null;
        if (parsedDate) {
          data.date = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
        }
      }

      await prisma.incident.update({
        where: { id: inc.id },
        data: {
          url: foundUrl,
          headline: data.headline || inc.headline,
          summary: data.summary || null,
          date: data.date || null,
          parsedDate,
          location: data.location || null,
          incidentType: data.incidentType || null,
          country: data.country || null,
          status: "COMPLETE",
          approved: false,
        },
      });
      fixed++;
      console.log(`  -> ${data.date} | ${data.location} | ${(data.summary ?? "").substring(0, 50)}`);
    } catch (e: any) {
      if (e.message?.includes("429")) {
        await sleep(5000);
        i--;
        continue;
      }
      console.error(`  Error: ${e.message?.substring(0, 80)}`);
    }
    await sleep(3000); // Be nice to Google
  }

  console.log(`\nFixed ${fixed}/${restored.length} restored incidents`);
  await prisma.$disconnect();
}

main().catch(console.error);
