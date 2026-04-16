/**
 * Find alt sources for FAILED incidents by extracting keywords from URLs
 * and searching Exa for accessible articles about the same story.
 *
 * Run: npx tsx scripts/fix-failed-via-exa.ts [--dry-run] [--limit=N]
 */
import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";
import Exa from "exa-js";
import Anthropic from "@anthropic-ai/sdk";
import { parseIncidentDate } from "../src/lib/geocode";

const prisma = new PrismaClient();
const exa = new Exa(process.env.EXA_API_KEY!);
const anthropic = new Anthropic();

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract a search query from a URL slug */
function urlToSearchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    // Get the last path segment (slug)
    const parts = u.pathname.split("/").filter(Boolean);
    let slug = parts[parts.length - 1] || parts[parts.length - 2] || "";

    // Remove file extensions and IDs
    slug = slug.replace(/\.html?$/, "").replace(/\.php$/, "");

    // Skip if it's just a numeric ID or too short
    if (/^\d+$/.test(slug) || slug.length < 10) {
      // Try using earlier path segments
      slug = parts.filter((p) => p.length > 10 && !/^\d+$/.test(p)).join(" ");
    }

    // Convert slug to words
    const words = slug
      .replace(/[-_]/g, " ")
      .replace(/\d{5,}/g, "") // remove long numbers
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter(
        (w) =>
          ![
            "story", "news", "article", "video", "com", "www", "https",
            "politics", "immigration", "html", "amp", "index",
          ].includes(w.toLowerCase())
      );

    if (words.length < 3) return null;

    // Take first 8-10 meaningful words
    return words.slice(0, 10).join(" ");
  } catch {
    return null;
  }
}

const EXTRACT_PROMPT = `Extract structured data from this article about a U.S. immigration enforcement incident. Return ONLY valid JSON:
{"headline":"Short headline max 15 words","date":"M/D/YYYY or null","location":"City, State or null","summary":"2-4 sentence factual summary","incidentType":"Comma-separated tags from ONLY these options. INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Resistance, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Native American, Indigenous (Non-U.S.), Vigilante, Disappearance/Detention, Military. ENFORCEMENT SETTING (where the enforcement action took place, if mentioned): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Criminal/Detainer, Public Space/Street","country":"Country of origin or null"}
Rules:
- "Policy/Stats": for aggregate statistics or policy changes without a specific named individual.
- "Disappearance/Detention": ONLY when a specific named person is detained or disappeared.
- Never use "illegal" to describe people. Use "undocumented".`;

// Domains to exclude from search (same sources that block us)
const EXCLUDE_DOMAINS = [
  "instagram.com", "twitter.com", "facebook.com", "tiktok.com", "reddit.com",
  "nytimes.com", "washingtonpost.com", "wsj.com",
];

async function main() {
  if (DRY_RUN) console.log("DRY RUN\n");

  const failed = await prisma.incident.findMany({
    where: {
      status: "FAILED",
      url: { not: { startsWith: "restored-" } },
    },
    select: { id: true, url: true, headline: true },
    orderBy: { id: "asc" },
  });

  const toProcess = failed.slice(0, LIMIT);
  console.log(`Found ${failed.length} FAILED incidents, processing ${toProcess.length}\n`);

  let fixed = 0;
  let skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const inc = toProcess[i];
    const query = inc.headline || urlToSearchQuery(inc.url);

    if (!query) {
      console.log(`[${inc.id}] No search query from URL: ${inc.url.substring(0, 60)}`);
      skipped++;
      continue;
    }

    console.log(`\n[${inc.id}] Searching: "${query.substring(0, 70)}"`);

    try {
      // Extract the original domain to exclude it (since it blocked us)
      const originalDomain = new URL(inc.url).hostname.replace("www.", "");
      const excludes = [...EXCLUDE_DOMAINS, originalDomain];

      const results = await exa.search(query, {
        numResults: 5,
        type: "auto",
        excludeDomains: excludes,
      });

      const articles = (results.results ?? []).filter((r) => r.url);
      if (articles.length === 0) {
        console.log("  No articles found");
        skipped++;
        continue;
      }

      // Get content from best result
      const best = articles[0];
      let articleText = "";
      try {
        const contents = await exa.getContents([best.url], {
          text: { maxCharacters: 3000 },
        });
        articleText = contents.results?.[0]?.text ?? "";
      } catch {}

      if (!articleText && best.title) {
        articleText = best.title;
      }

      if (!articleText) {
        console.log("  Could not get article content");
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  -> Would use: ${best.url}`);
        console.log(`  -> Title: ${best.title?.substring(0, 70)}`);
        fixed++;
        continue;
      }

      // Extract data
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `${EXTRACT_PROMPT}\n\nTitle: ${best.title ?? ""}\nPublished: ${best.publishedDate ?? ""}\nText: ${articleText.substring(0, 3000)}`,
          },
        ],
      });

      const text =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
      let jsonStr = text;
      if (jsonStr.startsWith("```"))
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

      const data = JSON.parse(jsonStr);

      // If extraction returns all nulls, skip
      if (!data.headline && !data.summary) {
        console.log("  Extraction returned empty data");
        skipped++;
        continue;
      }

      const parsedDate = parseIncidentDate(data.date || null);

      // Preserve original failed URL + other Exa results as alt sources
      const altUrls = [inc.url, ...articles.slice(1).map((a) => a.url)];

      await prisma.incident.update({
        where: { id: inc.id },
        data: {
          url: best.url,
          altSources: altUrls.length > 0 ? JSON.stringify(altUrls) : null,
          headline: data.headline || inc.headline,
          summary: data.summary || null,
          date: data.date || null,
          parsedDate,
          location: data.location || null,
          incidentType: data.incidentType || null,
          country: data.country || null,
          status: "COMPLETE",
          approved: false,
          errorMessage: null,
        },
      });

      fixed++;
      console.log(`  -> ${best.url}`);
      console.log(`  -> ${data.date} | ${data.location} | ${(data.summary ?? "").substring(0, 60)}`);
    } catch (e: any) {
      if (e.message?.includes("429")) {
        console.log("  Rate limited, waiting...");
        await sleep(5000);
        i--; // retry
        continue;
      }
      if (e.message?.includes("exceeded your credits")) {
        console.log("  Exa credits exhausted, stopping.");
        break;
      }
      console.error(`  Error: ${e.message?.substring(0, 100)}`);
    }

    await sleep(1200);
  }

  console.log(`\nDone: ${fixed} fixed, ${skipped} skipped out of ${toProcess.length}`);
  await prisma.$disconnect();
}

main().catch(console.error);
