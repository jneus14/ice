/**
 * Recover failed incidents by finding alternative news sources via Exa search.
 * For news articles: extract search terms from URL slug and find alt coverage.
 * For Instagram posts with caption data: use caption text to search for news coverage.
 *
 * Run: npx tsx scripts/recover-failed.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import Exa from "exa-js";

const DRY_RUN = process.argv.includes("--dry-run");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const exa = new Exa(process.env.EXA_API_KEY!);

type Incident = {
  id: number;
  url: string;
  headline: string | null;
  summary: string | null;
  rawHtml: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
  country: string | null;
  imageUrl: string | null;
};

function urlToSearchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    let slug = parts[parts.length - 1] || parts[parts.length - 2] || "";
    slug = slug.replace(/\.html?$/, "").replace(/\.php$/, "");

    // Handle NYT short URLs
    if (u.hostname === "nyti.ms") return null;

    if (/^\d+$/.test(slug) || slug.length < 10) {
      slug = parts.filter((p) => p.length > 10 && !/^\d+$/.test(p)).join(" ");
    }

    const words = slug
      .replace(/[-_]/g, " ")
      .replace(/\d{5,}/g, "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter(
        (w) =>
          ![
            "story", "news", "article", "video", "com", "www", "https",
            "politics", "html", "amp", "index", "extras", "reporttypo",
            "post", "local", "page",
          ].includes(w.toLowerCase())
      );

    if (words.length < 3) return null;
    return words.slice(0, 10).join(" ");
  } catch {
    return null;
  }
}

async function extractFromText(text: string, url: string, metadata: any) {
  const metaContext = [
    metadata.title && `Title: ${metadata.title}`,
    metadata.description && `Description: ${metadata.description}`,
    metadata.date && `Date: ${metadata.date}`,
    metadata.author && `Author: ${metadata.author}`,
  ].filter(Boolean).join("\n");

  const prompt = `You are a data extraction assistant. Given the text content of a news article about a U.S. immigration enforcement incident, extract the following fields. Return ONLY valid JSON with no markdown formatting.

{
  "headline": "A short headline summarizing the incident (max 15 words)",
  "date": "The date of the incident in M/D/YYYY format if available, otherwise null",
  "location": "City, State abbreviation (e.g. 'St. Paul, MN' or 'Chicago, IL'). Null if unavailable.",
  "summary": "A 2-4 sentence factual summary of what happened",
  "incidentType": "Comma-separated tags from ONLY these options. INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Resistance, Resources, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Process Issue, Judicial Decisions, 3rd Country Deportation, Native American, Indigenous (Non-U.S.), Vigilante, Disappearance/Detention. ENFORCEMENT SETTING (pick at most ONE): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Jail/Prison, Public Space/Street, Shelter. PERSON IMPACTED: DACA/Dreamer, LGBTQ+, LPR/Greencard, Minor, Native American (U.S.), Indigenous (Non-U.S.), Person with Disability, Refugee/Asylum Seeker, Student, Temporary Protected Status, U.S. Citizen, Protester/Intervenor, Palestine Advocate, Visa/Legal Status",
  "country": "Country of origin of the affected person if mentioned, otherwise null"
}

Rules:
- Only use tags from the provided list.
- Pick at most ONE enforcement setting tag.
- If the article is about general policy/stats rather than a specific incident, tag as "Policy/Stats".

${metaContext ? "Page metadata:\n" + metaContext + "\n\n" : ""}Article text:
${text.slice(0, 4000)}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return {};

  try {
    return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return {};
  }
}

function parseIncidentDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  const query = location.toLowerCase().includes("usa") ? location : `${location}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ICE-Tracker/1.0" } });
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function recoverIncident(client: Client, incident: Incident): Promise<boolean> {
  // Determine search query
  let query = urlToSearchQuery(incident.url);

  // For Instagram with caption data, extract key terms
  if (!query && incident.rawHtml && incident.rawHtml.length > 50) {
    const captionWords = incident.rawHtml
      .replace(/#\w+/g, "")
      .replace(/@\w+/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .slice(0, 200)
      .trim();
    if (captionWords.length > 20) {
      query = "ICE immigration enforcement " + captionWords.slice(0, 100);
    }
  }

  if (!query) {
    console.log(`  [${incident.id}] No search query extractable, skipping`);
    return false;
  }

  console.log(`  [${incident.id}] Searching: "${query.slice(0, 60)}..."`);

  try {
    const originalDomain = (() => {
      try { return new URL(incident.url).hostname.replace("www.", ""); }
      catch { return ""; }
    })();

    const results = await exa.search(query, {
      numResults: 3,
      type: "auto",
      excludeDomains: [
        "instagram.com", "twitter.com", "facebook.com", "tiktok.com", "reddit.com",
        ...(originalDomain ? [originalDomain] : []),
      ],
    });

    const articles = (results.results ?? []).filter((r: any) => r.url);
    if (articles.length === 0) {
      console.log(`  [${incident.id}] No alt sources found`);
      return false;
    }

    const best = articles[0];
    console.log(`  [${incident.id}] Found: ${best.url.slice(0, 70)}`);

    // Get content
    let articleText = "";
    try {
      const contents = await exa.getContents([best.url], {
        text: { maxCharacters: 4000 },
      });
      articleText = contents.results?.[0]?.text ?? "";
    } catch {}

    if (!articleText && best.title) articleText = best.title;
    if (!articleText) {
      console.log(`  [${incident.id}] No content retrievable`);
      return false;
    }

    // Extract
    const extracted = await extractFromText(articleText, best.url, {
      title: best.title ?? null,
      description: null,
      date: best.publishedDate ?? null,
      author: best.author ?? null,
    });

    if (!extracted.headline && !extracted.summary) {
      console.log(`  [${incident.id}] Extraction failed`);
      return false;
    }

    const finalDate = incident.date || extracted.date;
    const finalLocation = incident.location || extracted.location;
    const parsedDate = parseIncidentDate(finalDate);

    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      // Rate limit geocoding
      await new Promise((r) => setTimeout(r, 1100));
      const coords = await geocodeLocation(finalLocation);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }

    // Alt sources: original URL + other Exa results
    const altUrls = [incident.url, ...articles.slice(1).map((a: any) => a.url)];

    console.log(`  [${incident.id}] → "${extracted.headline?.slice(0, 60)}" (${finalLocation || "no location"})`);

    if (!DRY_RUN) {
      await client.query(
        `UPDATE "Incident" SET
          url = $1, "altSources" = $2, headline = $3, date = $4, "parsedDate" = $5,
          location = $6, latitude = $7, longitude = $8, summary = $9,
          "incidentType" = $10, country = $11, "imageUrl" = $12,
          status = 'COMPLETE', "errorMessage" = NULL
        WHERE id = $13`,
        [
          best.url,
          JSON.stringify(altUrls),
          incident.headline || extracted.headline,
          finalDate,
          parsedDate,
          finalLocation,
          latitude,
          longitude,
          incident.summary || extracted.summary,
          incident.incidentType || extracted.incidentType,
          incident.country || extracted.country,
          incident.imageUrl || null,
          incident.id,
        ]
      );
    }

    return true;
  } catch (err: any) {
    console.log(`  [${incident.id}] Error: ${err.message?.slice(0, 80)}`);
    return false;
  }
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN — no changes will be written.\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Get all failed incidents worth recovering
  const { rows: incidents } = await client.query<Incident>(`
    SELECT id, url, headline, summary, "rawHtml", date, location,
           latitude, longitude, "incidentType", country, "imageUrl"
    FROM "Incident"
    WHERE status = 'FAILED'
    AND url NOT LIKE '%courtlistener.com%'
    AND url NOT LIKE '%uscourts.gov%'
    AND url NOT LIKE '%storage.courtlistener%'
    AND url NOT LIKE 'restored-%'
    AND url NOT LIKE '%refworld.org%'
    AND url NOT LIKE '%afsc.org%'
    AND url NOT LIKE '%habeasdockets%'
    AND url NOT LIKE '%share.google%'
    AND url NOT LIKE '%stopice.net%'
    AND url NOT LIKE '%academia.edu%'
    AND url NOT LIKE '%instagram.com%'
    AND url NOT LIKE '%tiktok.com%'
    AND url NOT LIKE '%cbslocal.com%'
    AND url NOT LIKE '%/tag/%'
    AND url NOT LIKE '%/page/%'
    AND url NOT LIKE '%/category/%'
    ORDER BY id DESC
  `);

  console.log(`Found ${incidents.length} incidents to attempt recovery\n`);

  let recovered = 0;
  let failed = 0;

  for (const inc of incidents) {
    const success = await recoverIncident(client, inc);
    if (success) recovered++;
    else failed++;

    // Small delay between Exa requests
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. Recovered: ${recovered}, Failed: ${failed}${DRY_RUN ? " (DRY RUN)" : ""}`);

  await client.end();
}

main().catch(console.error);
