/**
 * Add stories from a newsletter roundup that aren't already in the database.
 * Run: npx tsx scripts/add-newsletter-stories.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import Exa from "exa-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const exa = new Exa(process.env.EXA_API_KEY!);

function parseIncidentDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

async function geocodeLocation(location: string) {
  const query = location.toLowerCase().includes("usa") ? location : location + ", USA";
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ICE-Tracker/1.0" } });
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

const STORIES_TO_SEARCH = [
  "Minnesota hospital workers sedated bipolar man ICE custody Sahan Journal 2026",
  "ICE violating guidelines pregnant women New York Times investigation 2026",
  "ICE temporary holding spaces long past time allowed Colorado Times Recorder 2026",
  "California bill limit markup products sold ICE detention centers Sierra Sun Times 2026",
  "Baker County Detention Center Florida TikTok video conditions women ICE 2026",
  "Guatemalan man permanent residency US citizen wife children ICE custody Miami Herald 2026",
  "ICE field offices Miami Dallas Atlanta San Antonio most arrests 2025 New York Times",
  "ICE raids construction businesses South Texas New York Times video 2026",
  "federal judge blocked Trump detaining refugees one year Reuters 2026",
  "animal rescue pets left behind immigration detained deported owners New York Times 2026",
  "ICE chased wrong person Vermont raid car crash busting home Vermont Public 2026",
  "Board of Immigration Appeals changes Trump administration sides DHS NPR 2026",
  "San Diego County immigration legal services funding shortage Union-Tribune 2026",
  "Department of Justice dismantled program free legal support immigrants CBS News 2026",
  "Minnesota sued Trump investigation documents Renee Good Alex Pretti POLITICO 2026",
  "Gregory Bovino Border Patrol retiring Associated Press 2026",
  "military presence border no impact crossings Border Chronicle War Horse 2026",
  "Arizona twins father deportation music Arizona Republic 2026",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let added = 0;

  for (const searchQuery of STORIES_TO_SEARCH) {
    console.log(`\nSearching: ${searchQuery.slice(0, 60)}...`);

    try {
      const results = await exa.search(searchQuery, {
        numResults: 3,
        type: "auto",
        excludeDomains: [
          "instagram.com", "twitter.com", "facebook.com", "tiktok.com",
          "reddit.com", "substack.com",
        ],
      });

      const articles = (results.results ?? []).filter((r: any) => r.url);
      if (articles.length === 0) {
        console.log("  No results found");
        continue;
      }

      const best = articles[0];

      // Check if URL already exists
      const existing = await client.query(
        'SELECT id FROM "Incident" WHERE url = $1',
        [best.url]
      );
      if (existing.rows.length > 0) {
        console.log(`  Already exists: [${existing.rows[0].id}] ${best.url.slice(0, 60)}`);
        continue;
      }

      console.log(`  Found: ${best.url.slice(0, 70)}`);

      // Get content
      let articleText = "";
      try {
        const contents = await exa.getContents([best.url], {
          text: { maxCharacters: 4000 },
        });
        articleText = contents.results?.[0]?.text ?? "";
      } catch {}

      if (!articleText) {
        console.log("  No content retrievable");
        continue;
      }

      // Extract incident data
      const resp = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `Extract from this article about immigration. Return ONLY valid JSON:
{
  "headline": "max 15 words",
  "date": "M/D/YYYY or null",
  "location": "City, ST or null",
  "summary": "2-4 sentences",
  "incidentType": "comma-separated tags",
  "country": "country of origin or null"
}

Available tags (use only from this list):
INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Resistance, Resources, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Disappearance/Detention
ENFORCEMENT SETTING (where the enforcement action took place, if mentioned): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Criminal/Detainer, Public Space/Street
PERSON IMPACTED: DACA/Dreamer, LGBTQ+, LPR/Greencard, Minor, Refugee/Asylum Seeker, Student, U.S. Citizen, Protester/Intervenor

Article:
${articleText.slice(0, 3000)}`,
        }],
      });

      const raw = resp.content[0].type === "text" ? resp.content[0].text : "{}";
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      if (jsonStart === -1) {
        console.log("  Extraction failed");
        continue;
      }
      const extracted = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

      if (!extracted.headline) {
        console.log("  No headline extracted");
        continue;
      }

      const loc = extracted.location;
      let lat = null, lng = null;
      if (loc) {
        await new Promise(r => setTimeout(r, 1100));
        const coords = await geocodeLocation(loc);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      const altUrls = articles.slice(1).map((a: any) => a.url);

      console.log(`  → ${extracted.headline?.slice(0, 60)} (${loc || "no location"})`);

      // Insert new incident
      await client.query(
        `INSERT INTO "Incident" (url, "altSources", headline, date, "parsedDate", location, latitude, longitude, summary, "incidentType", country, status, approved, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [
          best.url,
          altUrls.length > 0 ? JSON.stringify(altUrls) : null,
          extracted.headline,
          extracted.date,
          parseIncidentDate(extracted.date),
          loc,
          lat,
          lng,
          extracted.summary,
          extracted.incidentType,
          extracted.country,
          "COMPLETE",
          false, // pending approval
        ]
      );

      added++;
    } catch (err: any) {
      console.log(`  Error: ${err.message?.slice(0, 80)}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone. Added ${added} new incidents (pending approval).`);
  await client.end();
}

main().catch(console.error);
