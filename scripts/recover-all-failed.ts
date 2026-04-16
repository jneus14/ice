/**
 * Comprehensive recovery of ALL failed incidents:
 *   1. CourtListener PDFs: re-fetch and re-extract with Claude (17 incidents)
 *   2. News articles: find alt sources via Exa search (28 incidents)
 *   3. Instagram: skip (no recoverable data)
 *
 * Keeps the original URL as an altSource in all cases.
 *
 * Run: npx tsx scripts/recover-all-failed.ts [--dry-run]
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

function urlToSearchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    let slug = parts[parts.length - 1] || parts[parts.length - 2] || "";
    slug = slug.replace(/\.html?$/, "").replace(/\.php$/, "");
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
          !["story", "news", "article", "video", "com", "www", "https",
            "politics", "html", "amp", "index", "extras", "reporttypo",
            "post", "local", "page"].includes(w.toLowerCase())
      );
    if (words.length < 3) return null;
    return words.slice(0, 10).join(" ");
  } catch {
    return null;
  }
}

// -- CourtListener PDF recovery --

async function recoverCourtListenerPdf(
  client: Client,
  incident: Incident
): Promise<boolean> {
  console.log(`  [${incident.id}] Fetching PDF: ${incident.url.slice(0, 80)}`);

  try {
    // Normalize URL — some use www.courtlistener.com, some use storage.courtlistener.com
    let pdfUrl = incident.url;
    if (pdfUrl.includes("www.courtlistener.com/recap/")) {
      pdfUrl = pdfUrl.replace("www.courtlistener.com/recap/", "storage.courtlistener.com/recap/");
    }
    if (!pdfUrl.startsWith("https://storage.courtlistener.com") && !pdfUrl.includes("uscourts.gov")) {
      console.log(`  [${incident.id}] Unrecognized court URL format, skipping`);
      return false;
    }

    const resp = await fetch(pdfUrl);
    if (!resp.ok) {
      console.log(`  [${incident.id}] PDF fetch failed: ${resp.status}`);
      return false;
    }

    const pdfBuffer = Buffer.from(await resp.arrayBuffer());
    console.log(`  [${incident.id}] Fetched ${(pdfBuffer.length / 1024).toFixed(0)}KB PDF`);

    const pdfBase64 = pdfBuffer.toString("base64");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text: `This is a court document related to U.S. immigration enforcement. Extract:

{
  "headline": "Short headline about the enforcement incident (max 15 words)",
  "date": "Date of arrest/detention in M/D/YYYY, or null",
  "location": "City, State abbreviation where arrest occurred, or null",
  "summary": "2-4 sentence factual summary of who was detained, when, where, and what the court ordered",
  "incidentType": "Comma-separated tags from ONLY these options. INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Raid, Resistance, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Native American, Indigenous (Non-U.S.), Vigilante, Disappearance/Detention, Military. ENFORCEMENT SETTING (where the enforcement action took place, if mentioned): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Criminal/Detainer, Public Space/Street",
  "country": "Country of origin or null"
}

Rules:
- Always include "Litigation" tag
- Focus on factual BACKGROUND of who was arrested and why
- Do NOT use "illegal" to describe people
- Return ONLY valid JSON`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      console.log(`  [${incident.id}] No JSON in response`);
      return false;
    }

    const extracted = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!extracted.headline) {
      console.log(`  [${incident.id}] No headline extracted`);
      return false;
    }

    const finalDate = incident.date || extracted.date;
    const finalLocation = incident.location || extracted.location;
    const parsedDate = parseIncidentDate(finalDate);

    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      await new Promise((r) => setTimeout(r, 1100));
      const coords = await geocodeLocation(finalLocation);
      if (coords) { latitude = coords.lat; longitude = coords.lng; }
    }

    console.log(`  [${incident.id}] ✓ "${extracted.headline}" (${finalLocation || "no loc"})`);

    if (!DRY_RUN) {
      await client.query(
        `UPDATE "Incident" SET
          headline = COALESCE(headline, $1),
          date = COALESCE(date, $2),
          "parsedDate" = COALESCE("parsedDate", $3),
          location = COALESCE(location, $4),
          latitude = COALESCE(latitude, $5),
          longitude = COALESCE(longitude, $6),
          summary = COALESCE(summary, $7),
          "incidentType" = COALESCE("incidentType", $8),
          country = COALESCE(country, $9),
          status = 'COMPLETE',
          "errorMessage" = NULL
        WHERE id = $10`,
        [
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
    console.log(`  [${incident.id}] Error: ${err.message?.slice(0, 100)}`);
    return false;
  }
}

// -- News article recovery via Exa --

async function recoverNewsArticle(
  client: Client,
  incident: Incident
): Promise<boolean> {
  let query = incident.headline || urlToSearchQuery(incident.url);
  if (!query) {
    console.log(`  [${incident.id}] No search query extractable`);
    return false;
  }

  console.log(`  [${incident.id}] Searching: "${query.slice(0, 60)}"`);

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
      const contents = await exa.getContents([best.url], { text: { maxCharacters: 4000 } });
      articleText = contents.results?.[0]?.text ?? "";
    } catch {}

    if (!articleText && best.title) articleText = best.title;
    if (!articleText) {
      console.log(`  [${incident.id}] No content retrievable`);
      return false;
    }

    // Extract
    const metaContext = [
      best.title && `Title: ${best.title}`,
      best.publishedDate && `Date: ${best.publishedDate}`,
      best.author && `Author: ${best.author}`,
    ].filter(Boolean).join("\n");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a data extraction assistant. Extract from this news article about U.S. immigration enforcement. Return ONLY valid JSON:

{
  "headline": "max 15 words",
  "date": "M/D/YYYY or null",
  "location": "City, ST or null",
  "summary": "2-4 factual sentences",
  "incidentType": "comma-separated tags from: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Raid, Resistance, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Disappearance/Detention",
  "country": "country of origin or null"
}

${metaContext ? "Metadata:\n" + metaContext + "\n\n" : ""}Article:
${articleText.slice(0, 4000)}`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return false;

    const extracted = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!extracted.headline && !extracted.summary) {
      console.log(`  [${incident.id}] Extraction empty`);
      return false;
    }

    const finalDate = incident.date || extracted.date;
    const finalLocation = incident.location || extracted.location;
    const parsedDate = parseIncidentDate(finalDate);

    let latitude = incident.latitude;
    let longitude = incident.longitude;
    if (!latitude && !longitude && finalLocation) {
      await new Promise((r) => setTimeout(r, 1100));
      const coords = await geocodeLocation(finalLocation);
      if (coords) { latitude = coords.lat; longitude = coords.lng; }
    }

    // Keep original URL as altSource, use new article as primary
    const existingAlts = parseAltSources(incident.altSources);
    const altUrls = [incident.url, ...existingAlts, ...articles.slice(1).map((a: any) => a.url)]
      .filter((u, i, arr) => arr.indexOf(u) === i); // dedupe

    console.log(`  [${incident.id}] ✓ "${extracted.headline?.slice(0, 60)}" (${finalLocation || "no loc"})`);

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
          approved = false
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
    console.log(`  [${incident.id}] Error: ${err.message?.slice(0, 100)}`);
    return false;
  }
}

// -- Main --

async function main() {
  console.log(`Recover All Failed Incidents${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: allFailed } = await client.query<Incident>(`
    SELECT id, url, headline, summary, "rawHtml", date, location,
           latitude, longitude, "incidentType", country, "imageUrl", "altSources"
    FROM "Incident"
    WHERE status = 'FAILED'
    ORDER BY id
  `);

  console.log(`Total FAILED incidents: ${allFailed.length}\n`);

  // Categorize
  const courtDocs = allFailed.filter(
    (i) => i.url.includes("courtlistener.com") || i.url.includes("uscourts.gov")
  );
  const newsArticles = allFailed.filter(
    (i) =>
      !i.url.includes("courtlistener.com") &&
      !i.url.includes("uscourts.gov") &&
      !i.url.includes("instagram.com") &&
      !i.url.includes("tiktok.com") &&
      !i.url.includes("stopice.net") &&
      !i.url.startsWith("restored-") &&
      !i.url.includes("share.google") &&
      !i.url.includes("dbnimmigration.com") &&
      !i.url.includes("vaapvt.org") &&
      !i.url.includes("justia.com")
  );
  const instagram = allFailed.filter((i) => i.url.includes("instagram.com"));
  const unrecoverable = allFailed.length - courtDocs.length - newsArticles.length - instagram.length;

  console.log(`  Court docs: ${courtDocs.length}`);
  console.log(`  News articles: ${newsArticles.length}`);
  console.log(`  Instagram: ${instagram.length} (skipping — no data)`);
  console.log(`  Other unrecoverable: ${unrecoverable}\n`);

  let recovered = 0;
  let failed = 0;

  // 1. Recover court documents
  console.log(`\n=== COURT DOCUMENTS (${courtDocs.length}) ===\n`);
  for (const incident of courtDocs) {
    const ok = await recoverCourtListenerPdf(client, incident);
    if (ok) recovered++;
    else failed++;
  }

  // 2. Recover news articles
  console.log(`\n=== NEWS ARTICLES (${newsArticles.length}) ===\n`);
  for (const incident of newsArticles) {
    const ok = await recoverNewsArticle(client, incident);
    if (ok) recovered++;
    else failed++;
  }

  await client.end();

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Recovered: ${recovered}`);
  console.log(`Still failed: ${failed}`);
  console.log(`Skipped (Instagram/other): ${instagram.length + unrecoverable}`);
}

main().catch(console.error);
