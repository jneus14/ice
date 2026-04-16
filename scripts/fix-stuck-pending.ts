/**
 * Fix incidents that are COMPLETE but have no headline/summary — they appear
 * stuck in the admin console. Uses Exa to find alternative coverage, then
 * scrapes and extracts from the alternative source.
 *
 * Run: npx tsx scripts/fix-stuck-pending.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Exa from "exa-js";
import { Client } from "pg";

const EXA_API_KEY = process.env.EXA_API_KEY;
if (!EXA_API_KEY) {
  console.error("EXA_API_KEY not set");
  process.exit(1);
}

const exa = new Exa(EXA_API_KEY);

// Import project modules
import { scrapeUrl } from "../src/lib/scraper";
import { extractFromText } from "../src/lib/extractor";
import { parseIncidentDate } from "../src/lib/geocode";

function extractSearchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    // Skip social media, PDFs, court docs
    if (u.hostname.includes("instagram.com") || u.hostname.includes("tiktok.com")) return null;
    if (url.endsWith(".pdf")) return null;
    if (u.hostname.includes("courtlistener.com") || u.hostname.includes("uscourts.gov")) return null;
    if (u.hostname.includes("academia.edu")) return null;

    // Extract slug from path
    const path = u.pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);
    // Remove date segments and short segments
    const slugParts = segments
      .filter(s => !/^\d{4}$/.test(s) && !/^\d{1,2}$/.test(s) && s.length > 3)
      .slice(-2); // last 2 meaningful segments

    if (slugParts.length === 0) return null;

    const slug = slugParts.join(" ")
      .replace(/[-_]/g, " ")
      .replace(/\.(html?|php|aspx?)$/i, "")
      .trim();

    if (slug.length < 10) return null;
    return slug;
  } catch {
    return null;
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Find COMPLETE incidents with no headline
  const { rows } = await client.query<{ id: number; url: string; alt_sources: string | null }>(
    `SELECT id, url, "altSources" as alt_sources
     FROM "Incident"
     WHERE status = 'COMPLETE'
       AND (headline IS NULL OR headline = '')
     ORDER BY id`
  );

  console.log(`Found ${rows.length} stuck incidents to fix\n`);

  let fixed = 0;
  let skipped = 0;

  for (const row of rows) {
    const query = extractSearchQuery(row.url);
    if (!query) {
      console.log(`[${row.id}] No search query from URL: ${row.url.slice(0, 60)}`);
      skipped++;
      continue;
    }

    console.log(`[${row.id}] Searching: "${query.slice(0, 60)}"`);

    try {
      const searchResult = await exa.search(query, {
        numResults: 3,
        type: "keyword",
      });

      if (!searchResult.results || searchResult.results.length === 0) {
        console.log(`  No Exa results`);
        skipped++;
        continue;
      }

      // Try each result until one works
      let success = false;
      for (const result of searchResult.results) {
        if (result.url === row.url) continue; // skip same URL

        try {
          const { metadata, bodyText } = await scrapeUrl(result.url);
          const extracted = await extractFromText(bodyText, result.url, metadata);

          if (!extracted.headline && !extracted.summary) continue;

          // Preserve original URL as alt source
          const existingAlt = row.alt_sources ? JSON.parse(row.alt_sources) : [];
          const allAlt = [...new Set([row.url, ...existingAlt])].filter(u => u !== result.url);

          const bestDate = extracted.date || null;
          const parsedDate = parseIncidentDate(bestDate);

          await client.query(
            `UPDATE "Incident" SET
              url = $1,
              "altSources" = $2,
              headline = $3,
              summary = $4,
              date = $5,
              "parsedDate" = $6,
              location = COALESCE($7, location),
              "incidentType" = COALESCE($8, "incidentType"),
              country = COALESCE($9, country),
              status = 'COMPLETE'
            WHERE id = $10`,
            [
              result.url,
              allAlt.length > 0 ? JSON.stringify(allAlt) : null,
              extracted.headline,
              extracted.summary,
              bestDate,
              parsedDate,
              extracted.location,
              extracted.incidentType,
              extracted.country,
              row.id,
            ]
          );

          console.log(`  ✓ Fixed via ${result.url.slice(0, 60)}`);
          console.log(`    "${extracted.headline?.slice(0, 70)}"`);
          fixed++;
          success = true;
          break;
        } catch (e: any) {
          continue;
        }
      }

      if (!success) {
        console.log(`  Could not fix from any Exa result`);
        skipped++;
      }
    } catch (e: any) {
      if (e.message?.includes("402") || e.message?.includes("credit")) {
        console.log(`  Exa credits exhausted, stopping.`);
        break;
      }
      console.log(`  Error: ${e.message?.slice(0, 80)}`);
      skipped++;
    }
  }

  await client.end();
  console.log(`\nDone: ${fixed} fixed, ${skipped} skipped out of ${rows.length}`);
}

main().catch(console.error);
