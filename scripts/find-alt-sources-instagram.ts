/**
 * Find alternative news sources for Instagram-only incidents that are already
 * COMPLETE. Uses Claude to extract specific search queries (person name + event)
 * from the summary, searches Exa, then verifies the found article is about
 * the same incident before saving.
 *
 * Run: npx tsx scripts/find-alt-sources-instagram.ts [--dry-run] [--limit N]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import Exa from "exa-js";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const idx = process.argv.indexOf("--limit");
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 200;
})();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const exa = new Exa(process.env.EXA_API_KEY!);

function parseAltSources(altSources: string | null): string[] {
  if (!altSources) return [];
  const trimmed = altSources.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [trimmed];
    } catch {
      return [trimmed].filter(Boolean);
    }
  }
  return [trimmed].filter(Boolean);
}

/**
 * Extract a specific, name-based search query from the incident.
 */
async function buildSearchQuery(
  headline: string,
  summary: string | null,
  location: string | null
): Promise<string | null> {
  const text = `Headline: ${headline}\nSummary: ${summary || "none"}\nLocation: ${location || "none"}`;

  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `From this immigration enforcement incident, extract a precise search query to find a NEWS ARTICLE about this EXACT incident. The query MUST include the person's full name if available. If no specific person is named, return SKIP.

${text}

Return ONLY the search query (5-12 words with the person's name), or SKIP if no name is available.`,
      },
    ],
  });

  const result =
    resp.content[0].type === "text" ? resp.content[0].text.trim() : "";
  if (result === "SKIP" || result.length < 5) return null;
  return result
    .replace(/^["']|["']$/g, "")
    .replace(/^search query:\s*/i, "")
    .slice(0, 120);
}

/**
 * Verify that a found article is about the same incident.
 */
async function verifyMatch(
  incidentHeadline: string,
  incidentSummary: string | null,
  articleTitle: string,
  articleText: string
): Promise<boolean> {
  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: `Is this news article about the SAME specific incident as the tracker entry? They must involve the same person(s) and event — not just the same topic.

TRACKER ENTRY:
${incidentHeadline}
${(incidentSummary || "").slice(0, 300)}

ARTICLE:
${articleTitle}
${articleText.slice(0, 500)}

Answer YES or NO only.`,
      },
    ],
  });

  const answer =
    resp.content[0].type === "text"
      ? resp.content[0].text.trim().toUpperCase()
      : "";
  return answer.startsWith("YES");
}

async function main() {
  console.log(
    `Find Alt Sources for Instagram Incidents${DRY_RUN ? " (DRY RUN)" : ""}, limit: ${LIMIT}\n`
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: incidents } = await client.query<{
    id: number;
    url: string;
    headline: string;
    summary: string | null;
    altSources: string | null;
    date: string | null;
    location: string | null;
  }>(
    `
    SELECT id, url, headline, summary, "altSources", date, location
    FROM "Incident"
    WHERE url LIKE '%instagram.com%'
      AND status = 'COMPLETE'
      AND headline IS NOT NULL
      AND ("altSources" IS NULL OR "altSources" = '' OR "altSources" = '[]')
    ORDER BY id
    LIMIT $1
  `,
    [LIMIT]
  );

  console.log(`Found ${incidents.length} Instagram-only incidents\n`);

  let found = 0;
  let skipped = 0;
  let noMatch = 0;
  let rejected = 0;

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];

    // Step 1: Build a name-specific search query
    const query = await buildSearchQuery(
      inc.headline,
      inc.summary,
      inc.location
    );
    if (!query) {
      skipped++;
      if ((i + 1) % 50 === 0)
        console.log(`  [${i + 1}/${incidents.length}] ...`);
      continue;
    }

    // Rate limit
    if (i > 0) await new Promise((r) => setTimeout(r, 300));

    try {
      const results = await exa.search(query, {
        numResults: 3,
        type: "auto",
        excludeDomains: [
          "instagram.com",
          "twitter.com",
          "facebook.com",
          "tiktok.com",
          "reddit.com",
          "threads.net",
        ],
      });

      const articles = (results.results ?? []).filter(
        (r: any) => r.url && !r.url.includes("instagram.com")
      );

      if (articles.length === 0) {
        noMatch++;
        continue;
      }

      // Step 2: Get content from best result and verify it's the same incident
      const best = articles[0];
      let articleText = "";
      try {
        const contents = await exa.getContents([best.url], {
          text: { maxCharacters: 2000 },
        });
        articleText = contents.results?.[0]?.text ?? "";
      } catch {}

      if (!articleText && !best.title) {
        noMatch++;
        continue;
      }

      const isMatch = await verifyMatch(
        inc.headline,
        inc.summary,
        best.title || "",
        articleText || best.title || ""
      );

      if (!isMatch) {
        rejected++;
        continue;
      }

      // Step 3: Collect verified URLs — check remaining results too
      const verifiedUrls: string[] = [best.url];
      for (const art of articles.slice(1)) {
        // Quick title check for additional sources
        if (art.title) {
          const alsoMatch = await verifyMatch(
            inc.headline,
            inc.summary,
            art.title,
            art.title
          );
          if (alsoMatch) verifiedUrls.push(art.url);
        }
      }

      console.log(
        `[${i + 1}] ${inc.id}: "${inc.headline.slice(0, 50)}" -> ${verifiedUrls[0].slice(0, 65)} (+${verifiedUrls.length - 1})`
      );

      if (!DRY_RUN) {
        const existing = parseAltSources(inc.altSources);
        const merged = [...new Set([...existing, ...verifiedUrls])];
        await client.query(
          `UPDATE "Incident" SET "altSources" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [JSON.stringify(merged), inc.id]
        );
      }

      found++;
    } catch (err: any) {
      console.log(
        `[${i + 1}] ${inc.id}: Error - ${err.message?.slice(0, 60)}`
      );
    }
  }

  await client.end();

  console.log(`\n=== SUMMARY ===`);
  console.log(`Processed: ${incidents.length}`);
  console.log(`Found verified alt sources: ${found}`);
  console.log(`Skipped (no named person): ${skipped}`);
  console.log(`No search results: ${noMatch}`);
  console.log(`Rejected (wrong incident): ${rejected}`);
  console.log(DRY_RUN ? "(DRY RUN)" : "");
}

main().catch(console.error);
