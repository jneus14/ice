/**
 * Recover failed Instagram-only incidents by:
 *   1. Fetching Instagram oEmbed to get the post caption
 *   2. Using caption text to search Exa for news article coverage
 *   3. Extracting incident data from the news article
 *   4. Updating the incident with the news source (keeping IG as altSource)
 *
 * Run: npx tsx scripts/recover-instagram.ts [--dry-run] [--limit N]
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
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 100;
})();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const exa = new Exa(process.env.EXA_API_KEY!);

type Incident = {
  id: number;
  url: string;
  headline: string | null;
  summary: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
  country: string | null;
  altSources: string | null;
};

// -- Helpers --

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

function parseIncidentDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

async function geocodeLocation(
  location: string
): Promise<{ lat: number; lng: number } | null> {
  const query = location.toLowerCase().includes("usa")
    ? location
    : `${location}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ICE-Tracker/1.0" },
    });
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/**
 * Try to get the Instagram post caption via oEmbed API.
 */
async function getInstagramCaption(igUrl: string): Promise<string | null> {
  try {
    // Normalize URL — strip query params, ensure it ends properly
    const cleanUrl = igUrl.split("?")[0].replace(/\/$/, "") + "/";
    const oembedUrl = `https://graph.facebook.com/v22.0/instagram_oembed?url=${encodeURIComponent(cleanUrl)}&access_token=${process.env.INSTAGRAM_TOKEN || ""}`;

    // Try oEmbed first (requires token)
    if (process.env.INSTAGRAM_TOKEN) {
      const resp = await fetch(oembedUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.title) return data.title;
      }
    }

    // Fallback: try fetching the page and extracting og:description
    const resp = await fetch(igUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Extract og:description or meta description
    const ogMatch = html.match(
      /property="og:description"\s+content="([^"]+)"/
    );
    if (ogMatch) return decodeHTMLEntities(ogMatch[1]);

    const descMatch = html.match(
      /name="description"\s+content="([^"]+)"/
    );
    if (descMatch) return decodeHTMLEntities(descMatch[1]);

    // Try to find caption in JSON-LD or shared data
    const captionMatch = html.match(/"caption":\s*\{[^}]*"text":\s*"([^"]+)"/);
    if (captionMatch) return decodeHTMLEntities(captionMatch[1]);

    return null;
  } catch {
    return null;
  }
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\\n/g, "\n");
}

/**
 * Filter altSources to find actual news article URLs worth trying.
 */
function getUsefulAltUrls(altSources: string | null): string[] {
  const alts = parseAltSources(altSources);
  return alts.filter((url) => {
    // Skip junk domains
    if (/ift\.tt|linkedin\.com|threads\.com|ratemyprofessors|spokeo\.com|ussearch\.com|background-checks|tapas\.io|webcomic|tumblr\.com|actionnetwork\.org|cargocollective|substack\.com\/p\/(?:seeds|the-one-word|as-the-world)|grokipedia|birdeye\.com|best-hashtags|haircutstory|kemhealth|urmc\.rochester|progyny\.com|misfprofesores|lipstickalley/.test(url)) {
      return false;
    }
    // Keep news domains
    if (/\.(com|org|net|edu)\//.test(url) && url.length > 30) {
      return true;
    }
    return false;
  });
}

/**
 * Use Claude to distill an Instagram caption into a search query.
 */
async function captionToSearchQuery(
  caption: string
): Promise<string | null> {
  if (caption.length < 20) return null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `This is an Instagram caption about a U.S. immigration enforcement incident. Extract a short search query (5-10 words) to find a news article about the same incident. Focus on the person's name, location, and what happened. If this is not about a specific incident (it's a meme, ad, general commentary, etc.), respond with just "SKIP".

Caption: ${caption.slice(0, 1000)}

Search query:`,
        },
      ],
    });

    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "";
    if (text === "SKIP" || text.length < 5) return null;
    // Clean up — remove quotes, "Search query:" prefix, etc.
    return text
      .replace(/^["']|["']$/g, "")
      .replace(/^search query:\s*/i, "")
      .slice(0, 100);
  } catch {
    return null;
  }
}

const EXTRACT_PROMPT = `You are a data extraction assistant. Extract from this news article about a U.S. immigration enforcement incident. Return ONLY valid JSON:

{
  "headline": "max 15 words",
  "date": "M/D/YYYY or null",
  "location": "City, ST or null",
  "summary": "2-4 factual sentences",
  "incidentType": "Comma-separated tags from ONLY these options. INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Resistance, Resources, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Native American, Indigenous (Non-U.S.), Vigilante, Disappearance/Detention, Military. ENFORCEMENT SETTING (where the enforcement action took place, if mentioned): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Criminal/Detainer, Public Space/Street",
  "country": "country of origin or null"
}

Rules:
- Do NOT use the word "illegal" to describe people
- Return ONLY the JSON object`;

async function searchAndExtract(
  client: Client,
  incident: Incident,
  searchQuery: string
): Promise<boolean> {
  try {
    const results = await exa.search(searchQuery, {
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

    const articles = (results.results ?? []).filter((r: any) => r.url);
    if (articles.length === 0) return false;

    const best = articles[0];
    console.log(`    Found: ${best.url.slice(0, 80)}`);

    // Get content
    let articleText = "";
    try {
      const contents = await exa.getContents([best.url], {
        text: { maxCharacters: 4000 },
      });
      articleText = contents.results?.[0]?.text ?? "";
    } catch {}

    if (!articleText && best.title) articleText = best.title;
    if (!articleText) return false;

    const metaContext = [
      best.title && `Title: ${best.title}`,
      best.publishedDate && `Date: ${best.publishedDate}`,
      best.author && `Author: ${best.author}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${EXTRACT_PROMPT}

${metaContext ? "Metadata:\n" + metaContext + "\n\n" : ""}Article:
${articleText.slice(0, 4000)}`,
        },
      ],
    });

    const raw =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "{}";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return false;

    const extracted = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!extracted.headline && !extracted.summary) return false;

    const finalDate = incident.date || extracted.date;
    const finalLocation = incident.location || extracted.location;
    const parsedDate = parseIncidentDate(finalDate);

    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      await new Promise((r) => setTimeout(r, 1100));
      const coords = await geocodeLocation(finalLocation);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }

    // Keep original IG URL as altSource, use news article as primary
    const existingAlts = parseAltSources(incident.altSources);
    const altUrls = [
      incident.url,
      ...existingAlts,
      ...articles.slice(1).map((a: any) => a.url),
    ].filter((u, i, arr) => arr.indexOf(u) === i);

    console.log(
      `    ✓ "${extracted.headline?.slice(0, 60)}" (${finalLocation || "no loc"})`
    );

    if (!DRY_RUN) {
      await client.query(
        `UPDATE "Incident" SET
          url = $1,
          "altSources" = $2,
          headline = COALESCE($3, headline),
          date = COALESCE($4, date),
          "parsedDate" = COALESCE($5, "parsedDate"),
          location = COALESCE($6, location),
          latitude = COALESCE($7, latitude),
          longitude = COALESCE($8, longitude),
          summary = COALESCE($9, summary),
          "incidentType" = COALESCE($10, "incidentType"),
          country = COALESCE($11, country),
          status = 'COMPLETE',
          "errorMessage" = NULL,
          approved = false,
          "updatedAt" = NOW()
        WHERE id = $12`,
        [
          best.url,
          JSON.stringify(altUrls),
          extracted.headline,
          finalDate,
          parsedDate,
          finalLocation,
          latitude,
          longitude,
          extracted.summary,
          extracted.incidentType,
          extracted.country,
          incident.id,
        ]
      );
    }

    return true;
  } catch (err: any) {
    console.log(`    Error: ${err.message?.slice(0, 100)}`);
    return false;
  }
}

async function main() {
  console.log(
    `Recover Instagram Incidents${DRY_RUN ? " (DRY RUN)" : ""}, limit: ${LIMIT}\n`
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: incidents } = await client.query<Incident>(`
    SELECT id, url, headline, summary, date, location,
           latitude, longitude, "incidentType", country, "altSources"
    FROM "Incident"
    WHERE url LIKE '%instagram.com%'
      AND (status = 'FAILED' OR headline IS NULL)
    ORDER BY id
  `);

  console.log(`Found ${incidents.length} failed Instagram incidents\n`);

  let recovered = 0;
  let skipped = 0;
  let failed = 0;
  const toProcess = incidents.slice(0, LIMIT);

  for (let i = 0; i < toProcess.length; i++) {
    const incident = toProcess[i];
    console.log(
      `\n[${i + 1}/${toProcess.length}] ID ${incident.id}: ${incident.url.slice(0, 60)}`
    );

    // Strategy 1: Check if we have useful alt source URLs already
    const usefulAlts = getUsefulAltUrls(incident.altSources);
    if (usefulAlts.length > 0) {
      console.log(`  Has ${usefulAlts.length} alt source(s), trying first...`);
      let found = false;
      for (const altUrl of usefulAlts.slice(0, 2)) {
        console.log(`    Trying: ${altUrl.slice(0, 80)}`);
        try {
          let articleText = "";
          try {
            const contents = await exa.getContents([altUrl], {
              text: { maxCharacters: 4000 },
            });
            articleText = contents.results?.[0]?.text ?? "";
          } catch {
            // Fallback: fetch directly
            const resp = await fetch(altUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
              redirect: "follow",
            });
            if (resp.ok) articleText = await resp.text();
          }
          if (articleText && articleText.length > 200) {
            const ok = await searchAndExtract(client, incident, "");
            if (ok) {
              found = true;
              recovered++;
              break;
            }
          }
        } catch {}
      }
      if (found) continue;
    }

    // Strategy 2: Get Instagram caption via oEmbed/page scrape
    console.log(`  Fetching Instagram caption...`);
    const caption = await getInstagramCaption(incident.url);

    if (caption && caption.length > 20) {
      console.log(
        `  Caption: "${caption.slice(0, 100)}${caption.length > 100 ? "..." : ""}"`
      );

      // Convert caption to a search query
      const query = await captionToSearchQuery(caption);
      if (query) {
        console.log(`  Search: "${query}"`);
        const ok = await searchAndExtract(client, incident, query);
        if (ok) {
          recovered++;
          continue;
        }
      } else {
        console.log(`  ⚠ Not a specific incident, skipping`);
        skipped++;
        continue;
      }
    } else {
      console.log(`  ⚠ No caption available`);
    }

    // Strategy 3: Try searching with just "immigration" + any useful keywords from alt sources
    if (usefulAlts.length > 0) {
      // Already tried above
      console.log(`  ⚠ Alt sources didn't work either`);
    }

    failed++;
  }

  await client.end();

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Recovered: ${recovered}`);
  console.log(`Skipped (not incidents): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(
    `Remaining: ${incidents.length - toProcess.length}${DRY_RUN ? " (DRY RUN)" : ""}`
  );
}

main().catch(console.error);
