/**
 * Add stories from WOLA border update that aren't already in the database.
 * Run: npx tsx scripts/add-wola-stories.ts
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

const STORIES = [
  "Jose Guadalupe Ramos Solano Adelanto ICE death March 2026 LA Taco",
  "Paolo Zampolli Trump friend ICE detain mother child custody New York Times 2026",
  "Abel Ortiz self-deportee Los Angeles Mexico Guardian 38 years 2026",
  "New Jersey 10th state law barring local ICE contracts Bolts 2026",
  "Fray Matias Cordova human rights center Tapachula broken into raided 2026",
  "Supreme Court metering asylum Al Otro Lado border arguments 2026",
  "ICEBlock app Rafael Concepcion immigration ICE tracking Wired 2026",
  "Border Patrol ignored orders end chase gassed Chicago East Side neighborhood Unraveled 2026",
  "ICE agents airports TSA screening DHS shutdown passengers 2026",
  "immigration court observers locked out hearings Chicago Tribune 2026",
  "San Diego population loss immigration decline consequences 2026",
  "Minnesota legal battle ICE shooters accountability ProPublica 2026",
  "Pentagon civilian workers join ICE volunteer force Intercept 2026",
  "Dilley detention center Ms Rachel children conditions 2026 RAICES report",
  "ICE DNA samples arrested protesters NPR 2026",
  "Stephen Miller Texas undocumented children schools New York Times 2026",
  "Rape calls ICE detention San Diego sheriff CalMatters 2026",
  "LaMonica McIver congresswoman Trump prosecution ICE facility Atlantic 2026",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let added = 0;

  for (const searchQuery of STORIES) {
    console.log(`\nSearching: ${searchQuery.slice(0, 65)}...`);

    try {
      const results = await exa.search(searchQuery, {
        numResults: 3,
        type: "auto",
        excludeDomains: [
          "instagram.com", "twitter.com", "facebook.com", "tiktok.com",
          "reddit.com", "substack.com", "wola.org",
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
          content: `Extract from this article about immigration enforcement. Return ONLY valid JSON:
{
  "headline": "max 15 words",
  "date": "M/D/YYYY or null",
  "location": "City, ST or null",
  "summary": "2-4 factual sentences about what happened",
  "incidentType": "comma-separated tags",
  "country": "country of origin or null"
}

Available tags (use only from this list):
INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Resistance, Resources, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Process Issue, Court Order Violation, Litigation, 3rd Country Deportation, Disappearance/Detention
ENFORCEMENT SETTING (pick at most ONE): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Jail/Prison, Public Space/Street, Shelter
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

      console.log(`  → ${extracted.headline?.slice(0, 65)} (${loc || "no location"})`);

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
          false,
        ]
      );

      added++;
    } catch (err: any) {
      console.log(`  Error: ${err.message?.slice(0, 100)}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone. Added ${added} new incidents (pending approval).`);
  await client.end();
}

main().catch(console.error);
