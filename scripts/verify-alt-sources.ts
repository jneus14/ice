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

async function fetchTitle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
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
    // Read just enough to get the title
    const text = await res.text();
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim().substring(0, 200);
    // Try og:title
    const ogMatch = text.match(
      /property="og:title"\s+content="([^"]+)"/i
    );
    if (ogMatch) return ogMatch[1].trim().substring(0, 200);
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const incidents = await prisma.incident.findMany({
    where: {
      altSources: { not: null },
      headline: { not: null },
      status: "COMPLETE",
    },
    select: {
      id: true,
      headline: true,
      summary: true,
      url: true,
      altSources: true,
    },
    orderBy: { id: "desc" },
  });

  console.log(`Verifying alt sources for ${incidents.length} incidents...\n`);

  let totalRemoved = 0;
  let totalKept = 0;
  let incidentsFixed = 0;

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    let alts: string[];
    try {
      alts = JSON.parse(inc.altSources!);
    } catch {
      continue;
    }
    if (!Array.isArray(alts) || alts.length === 0) continue;

    // Fetch titles for all alt sources
    const sourceTitles: Array<{ url: string; title: string | null }> = [];
    for (const url of alts) {
      const title = await fetchTitle(url);
      sourceTitles.push({ url, title });
    }

    // Filter out sources where we couldn't get a title (likely dead links)
    const withTitles = sourceTitles.filter((s) => s.title);
    const noTitles = sourceTitles.filter((s) => !s.title);

    if (withTitles.length === 0) continue;

    // Use Claude to verify which sources match this incident
    try {
      const sourceList = withTitles
        .map((s, idx) => `${idx + 1}. "${s.title}" (${new URL(s.url).hostname})`)
        .join("\n");

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `Does each source article cover the SAME specific incident as the main article?

Main article headline: "${inc.headline}"
Main article summary: "${(inc.summary ?? "").substring(0, 300)}"

Source articles:
${sourceList}

For each source, answer YES if it likely covers the same specific incident (same person, same event) or NO if it appears to be about a different incident or unrelated.
Return ONLY a comma-separated list of YES/NO in order. Example: YES,YES,NO,YES`,
          },
        ],
      });

      const response =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      const verdicts = response
        .split(",")
        .map((v) => v.trim().toUpperCase().startsWith("YES"));

      const kept: string[] = [];
      const removed: string[] = [];

      withTitles.forEach((s, idx) => {
        if (idx < verdicts.length && verdicts[idx]) {
          kept.push(s.url);
        } else {
          removed.push(s.url);
        }
      });

      // Also keep sources without titles (can't verify, benefit of doubt — actually remove these too)
      // Dead links are not useful

      if (removed.length > 0 || noTitles.length > 0) {
        const newAlts = kept;
        await prisma.incident.update({
          where: { id: inc.id },
          data: {
            altSources: newAlts.length > 0 ? JSON.stringify(newAlts) : null,
          },
        });
        totalRemoved += removed.length + noTitles.length;
        totalKept += kept.length;
        incidentsFixed++;

        if (removed.length > 0) {
          console.log(
            `[${inc.id}] Removed ${removed.length} mismatched source(s) | ${inc.headline?.substring(0, 55)}`
          );
          for (const r of removed) {
            const title = withTitles.find((s) => s.url === r)?.title ?? "";
            console.log(`  ✗ ${title.substring(0, 60)} (${new URL(r).hostname})`);
          }
        }
        if (noTitles.length > 0) {
          console.log(
            `  + Removed ${noTitles.length} dead link(s)`
          );
        }
      } else {
        totalKept += kept.length;
      }
    } catch (e: any) {
      if (e.message?.includes("429")) {
        console.log("Rate limited, waiting 5s...");
        await sleep(5000);
        i--;
        continue;
      }
      console.error(`[${inc.id}] Error: ${e.message?.substring(0, 80)}`);
    }

    if (i % 50 === 49) {
      console.log(
        `\nProgress: ${i + 1}/${incidents.length} | Fixed: ${incidentsFixed} | Removed: ${totalRemoved} | Kept: ${totalKept}\n`
      );
    }
    if (i % 3 === 2) await sleep(1200);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Incidents checked: ${incidents.length}`);
  console.log(`Incidents fixed: ${incidentsFixed}`);
  console.log(`Sources removed: ${totalRemoved}`);
  console.log(`Sources kept: ${totalKept}`);
  await prisma.$disconnect();
}

main().catch(console.error);
