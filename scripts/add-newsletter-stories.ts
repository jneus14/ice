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
  "Supreme Court birthright citizenship arguments Trump April 2026",
  "Emmanuel Dumas funeral immigration custody death New York Times 2026",
  "Rohingya refugee death ruled homicide Border Patrol New York officials 2026 Reuters",
  "Maryland roofing workers ICE arrest unpaid wages Migrant Insider 2026",
  "DACA recipient detained leaving home breastmilk newborn NICU Spectrum News 2026",
  "DNA database missing migrants nonprofit dissolved Border Chronicle 2026",
  "USCIS social media handles citizenship visa Federal Register 2026",
  "South Sudan student Duke University visa revoked Wall Street Journal 2026",
  "Texas professional license immigration status proof Texas Tribune 2026",
  "government shutdown DHS Homeland Security Republican agreement April 2026",
  "UC Irvine professor Stockholm Prize criminology immigration San Francisco Chronicle 2026",
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
