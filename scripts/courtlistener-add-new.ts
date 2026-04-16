/**
 * Fetch available court documents from CourtListener RECAP for unmatched
 * immigration cases, extract arrest/incident details, and add them as
 * new incidents in the tracker.
 *
 * Run: npx tsx scripts/courtlistener-add-new.ts [--dry-run] [--limit N]
 *
 * This script:
 * 1. Searches CourtListener for habeas corpus cases with available TRO/order docs
 * 2. Filters out cases already in the DB (by name match or URL)
 * 3. Downloads available court orders (PDFs)
 * 4. Extracts incident details using Claude
 * 5. Adds new incidents to the DB
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const idx = process.argv.indexOf("--limit");
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 10;
})();

const COURTLISTENER_BASE = "https://www.courtlistener.com";
const STORAGE_BASE = "https://storage.courtlistener.com";
const SEARCH_API = `${COURTLISTENER_BASE}/api/rest/v4/search/`;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// -- Types --
type CLDocument = {
  absolute_url: string;
  description: string;
  short_description: string;
  entry_date_filed: string;
  document_number: number;
  is_available: boolean;
  filepath_local: string | null;
  page_count: number | null;
};

type CLResult = {
  caseName: string;
  docketNumber: string;
  court: string;
  court_id: string;
  dateFiled: string;
  docket_absolute_url: string;
  docket_id: number;
  recap_documents: CLDocument[];
};

type CLResponse = {
  count: number;
  document_count: number;
  next: string | null;
  results: CLResult[];
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

const IGNORE_WORDS = new Set([
  "united", "states", "state", "city", "county", "department",
  "homeland", "security", "immigration", "customs", "enforcement",
  "warden", "official", "secretary", "attorney", "general",
  "the", "and", "for", "inc", "llc", "usa", "dhs", "ice",
  "cbp", "bondi", "noem", "lyons", "trump", "mullin", "kaiser",
  "albarran", "chestnut", "wofford", "parra", "walker", "genalo",
  "arteta", "castro", "larose", "jordan", "casey", "hyde",
  "semaia", "robbins", "janecka", "ladwig", "guthrie", "maydak",
  "santacruz", "baltazar", "dosanj", "hermosillo", "swearingen",
  "raycraft", "wamsley", "lowe",
]);

function normalizeName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
}

function extractPetitionerNames(caseName: string): string[] {
  const vsSplit = caseName.split(/\s+v\.\s+/i);
  if (vsSplit.length < 2) return [];
  let nameStr = vsSplit[0].trim();
  if (/^united\s+states/i.test(nameStr)) nameStr = vsSplit[1].trim();
  nameStr = nameStr.replace(/^\(HC\)\s*/i, "").trim();
  return nameStr.split(/[\s,]+/).filter((p) => p.length > 1)
    .filter((p) => !IGNORE_WORDS.has(p.toLowerCase().replace(/[^a-z]/g, "")));
}

function matchesAnyIncident(
  petitionerNames: string[],
  incidentTexts: string[]
): boolean {
  const substantialNames = petitionerNames.map((n) => normalizeName(n)).filter((n) => n.length >= 4);
  if (substantialNames.length === 0) return false;
  if (substantialNames.length === 1 && substantialNames[0].length < 6) return false;

  for (const text of incidentTexts) {
    const allMatch = substantialNames.every((name) => {
      const regex = new RegExp(`\\b${name}\\b`, "i");
      return regex.test(text);
    });
    if (allMatch) return true;
  }
  return false;
}

/**
 * Get the best available substantive document from a case.
 * Prioritizes TRO orders and preliminary injunctions.
 */
function getBestDocument(result: CLResult): CLDocument | null {
  const docs = result.recap_documents.filter((d) => d.is_available && d.filepath_local);

  // Priority order: TRO/preliminary injunction > other orders > petitions
  const tro = docs.find((d) =>
    d.description?.match(/order.*(granting|TRO|temporary restraining)/i) ||
    d.short_description?.match(/TRO|temporary restraining/i)
  );
  if (tro) return tro;

  const prelim = docs.find((d) =>
    d.description?.match(/preliminary injunction/i) ||
    d.short_description?.match(/preliminary injunction/i)
  );
  if (prelim) return prelim;

  const order = docs.find((d) =>
    d.description?.match(/order.*(granting|release|habeas)/i) ||
    d.short_description?.match(/^order$/i)
  );
  if (order) return order;

  // Any available substantive doc
  return docs.find((d) =>
    d.description?.match(/order|petition|complaint|memorandum/i)
  ) ?? null;
}

async function fetchPdf(filepath: string): Promise<Buffer | null> {
  const url = `${STORAGE_BASE}/${filepath}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

async function extractFromDocument(
  pdfBuffer: Buffer,
  caseName: string,
  docketNumber: string,
  courtId: string,
  dateFiled: string
): Promise<{
  headline: string;
  date: string | null;
  location: string | null;
  summary: string;
  incidentType: string;
  country: string | null;
} | null> {
  // Save temporarily
  const tmpPath = path.join("/tmp", `cl-${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, pdfBuffer);

  try {
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
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `This is a court document from ${caseName} (${docketNumber}, ${courtId}, filed ${dateFiled}).

Extract the following from this document. Return ONLY valid JSON:

{
  "headline": "A short headline summarizing the immigration enforcement incident (max 15 words)",
  "date": "Date of the arrest/detention in M/D/YYYY format, or null",
  "location": "City, State abbreviation where the arrest occurred, or null",
  "summary": "2-4 sentence factual summary: who was detained, when, where, how, their immigration status, and what the court ordered",
  "incidentType": "Comma-separated tags from ONLY these options. INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Family Separation, Minor/Family, U.S. Citizen, Raid, Resistance, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Native American, Indigenous (Non-U.S.), Vigilante, Disappearance/Detention, Military. ENFORCEMENT SETTING (where the enforcement action took place, if mentioned): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Criminal/Detainer, Public Space/Street",
  "country": "Country of origin of the detained person, or null"
}

Rules:
- Focus on the factual BACKGROUND section of the court document — who was arrested, when, where, why
- The headline should be about the enforcement incident, not the court ruling
- Always include "Litigation" tag since this has a court case
- Use "Detained" if someone was arrested/detained
- Use "Deported" only if someone was actually deported
- If no specific arrest/incident details are available, return null for all fields
- Do NOT use the word "illegal" to describe people
- Return ONLY the JSON object, no other text`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!parsed.headline) return null;
    return parsed;
  } catch (err) {
    console.error(`  Error extracting: ${err}`);
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

async function main() {
  console.log(`CourtListener New Incidents${DRY_RUN ? " (DRY RUN)" : ""}, limit: ${LIMIT}\n`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Load existing incidents for name matching
  const { rows: incidents } = await client.query<{
    id: number;
    url: string;
    headline: string | null;
    summary: string | null;
    altSources: string | null;
  }>(
    `SELECT id, url, headline, summary, "altSources"
     FROM "Incident"
     WHERE headline IS NOT NULL
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents from database\n`);

  // Build text index for matching
  const incidentTexts = incidents.map((inc) =>
    [inc.headline ?? "", inc.summary ?? ""].join(" ").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  // Existing CL URLs
  const existingCLUrls = new Set<string>();
  for (const inc of incidents) {
    if (inc.url.includes("courtlistener.com")) existingCLUrls.add(inc.url);
    for (const alt of parseAltSources(inc.altSources)) {
      if (alt.includes("courtlistener.com")) existingCLUrls.add(alt);
    }
  }

  // Search for cases with TRO orders
  const searches = [
    `${SEARCH_API}?type=r&q=%22order+granting%22+%22temporary+restraining%22&nature_of_suit=463&filed_after=2025-06-01&order_by=dateFiled+desc&format=json`,
    `${SEARCH_API}?type=r&q=%22Sergio+Albarran%22&court=cand&order_by=dateFiled+desc&format=json`,
    `${SEARCH_API}?type=r&q=%22preliminary+injunction%22+%22detained%22&nature_of_suit=463&filed_after=2025-06-01&order_by=dateFiled+desc&format=json`,
  ];

  const allResults = new Map<number, CLResult>();

  for (const searchUrl of searches) {
    try {
      let url: string | null = searchUrl;
      let pages = 0;
      while (url && pages < 5) {
        const data: CLResponse = await (await fetch(url)).json();
        for (const r of data.results) {
          if (!allResults.has(r.docket_id)) allResults.set(r.docket_id, r);
        }
        url = data.next;
        pages++;
      }
    } catch {}
  }
  console.log(`Found ${allResults.size} unique cases\n`);

  // Filter to unmatched cases with available documents
  const candidates: { result: CLResult; doc: CLDocument }[] = [];

  for (const [, result] of allResults) {
    const clUrl = `${COURTLISTENER_BASE}${result.docket_absolute_url}`;
    if (existingCLUrls.has(clUrl)) continue;

    const petNames = extractPetitionerNames(result.caseName);
    if (matchesAnyIncident(petNames, incidentTexts)) continue;

    const doc = getBestDocument(result);
    if (!doc) continue;

    candidates.push({ result, doc });
  }

  console.log(`Found ${candidates.length} unmatched cases with available docs\n`);

  // Process top N
  const toProcess = candidates.slice(0, LIMIT);
  let added = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const { result, doc } = toProcess[i];
    const clUrl = `${COURTLISTENER_BASE}${result.docket_absolute_url}`;
    console.log(`\n[${i + 1}/${toProcess.length}] ${result.caseName} (${result.docketNumber})`);
    console.log(`  Doc: ${doc.short_description || doc.description?.slice(0, 80)}`);

    if (!doc.filepath_local) {
      console.log("  ⚠ No filepath, skipping");
      continue;
    }

    // Fetch PDF
    const pdfBuffer = await fetchPdf(doc.filepath_local);
    if (!pdfBuffer) {
      console.log("  ⚠ Failed to fetch PDF");
      continue;
    }
    console.log(`  📄 Fetched ${(pdfBuffer.length / 1024).toFixed(0)}KB PDF`);

    // Extract with Claude
    const extracted = await extractFromDocument(
      pdfBuffer,
      result.caseName,
      result.docketNumber,
      result.court_id,
      result.dateFiled
    );

    if (!extracted) {
      console.log("  ⚠ Extraction failed or no incident details");
      continue;
    }

    // Quality gate: skip thin extractions without useful details
    const hasDate = !!extracted.date;
    const hasLocation = !!extracted.location;
    const hasDetailedSummary = (extracted.summary?.length ?? 0) > 120;
    const hasCountry = !!extracted.country;
    const qualityScore = [hasDate, hasLocation, hasDetailedSummary, hasCountry].filter(Boolean).length;

    if (qualityScore < 2) {
      console.log(`  ⚠ Low quality (score ${qualityScore}/4), skipping: "${extracted.headline}"`);
      continue;
    }

    console.log(`  ✓ "${extracted.headline}" (quality: ${qualityScore}/4)`);
    console.log(`    Date: ${extracted.date}, Location: ${extracted.location}`);
    console.log(`    Tags: ${extracted.incidentType}`);
    console.log(`    Country: ${extracted.country}`);
    console.log(`    Summary: ${extracted.summary?.slice(0, 150)}...`);

    if (!DRY_RUN) {
      // Insert new incident
      await client.query(
        `INSERT INTO "Incident" (url, headline, date, location, summary, "incidentType", country, status, approved, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETE', false, NOW())
         ON CONFLICT (url) DO NOTHING`,
        [
          clUrl,
          extracted.headline,
          extracted.date,
          extracted.location,
          extracted.summary,
          extracted.incidentType,
          extracted.country,
        ]
      );
      console.log(`  ✅ Added to database`);
    }
    added++;
  }

  await client.end();
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Processed: ${toProcess.length} cases`);
  console.log(`Added: ${added} new incidents${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`Remaining candidates: ${candidates.length - toProcess.length}`);
}

main().catch(console.error);
