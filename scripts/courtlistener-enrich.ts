/**
 * Search CourtListener RECAP for immigration enforcement court cases,
 * match them against existing incidents in the database, and:
 *   1. Enrich existing incidents with court docket links
 *   2. Identify new cases not yet in the tracker
 *
 * Run: npx tsx scripts/courtlistener-enrich.ts [--dry-run] [--add-new]
 *
 * Strategies:
 *   - nature_of_suit=463 (habeas corpus alien detainee) with available docs
 *   - Searches for named ICE field office directors
 *   - "deportation officer" declarations
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const ADD_NEW = process.argv.includes("--add-new");
const COURTLISTENER_BASE = "https://www.courtlistener.com";
const SEARCH_API = `${COURTLISTENER_BASE}/api/rest/v4/search/`;

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
  dateTerminated: string | null;
  docket_absolute_url: string;
  docket_id: number;
  assignedTo: string;
  cause: string;
  suitNature: string;
  party: string[];
  recap_documents: CLDocument[];
};

type CLResponse = {
  count: number;
  document_count: number;
  next: string | null;
  results: CLResult[];
};

type DBIncident = {
  id: number;
  url: string;
  headline: string | null;
  summary: string | null;
  altSources: string | null;
  date: string | null;
  location: string | null;
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

function serializeAltSources(urls: string[]): string | null {
  const filtered = urls.map((u) => u.trim()).filter(Boolean);
  return filtered.length > 0 ? JSON.stringify(filtered) : null;
}

/**
 * Words to ignore when extracting party names — these are too common
 * and cause false matches.
 */
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

/**
 * Extract meaningful name parts from a CourtListener case name.
 * For civil cases (X v. Government), uses petitioner name.
 * For criminal cases (United States v. X), uses defendant name.
 * e.g. "Castillo Gomez v. Albarran" -> ["Castillo", "Gomez"]
 *      "United States v. Hernandez" -> ["Hernandez"]
 *      "(HC) Al-Kashif v. Albarran" -> ["Al-Kashif"]
 */
function extractPetitionerNames(caseName: string): string[] {
  const vsSplit = caseName.split(/\s+v\.\s+/i);
  if (vsSplit.length < 2) return [];

  let nameStr = vsSplit[0].trim();

  // For criminal cases (United States v. X), use the defendant name
  if (/^united\s+states/i.test(nameStr)) {
    nameStr = vsSplit[1].trim();
  }

  // Strip common prefixes like "(HC)"
  nameStr = nameStr.replace(/^\(HC\)\s*/i, "").trim();

  // Split into parts
  const parts = nameStr
    .split(/[\s,]+/)
    .filter((p) => p.length > 1)
    .filter((p) => !IGNORE_WORDS.has(p.toLowerCase().replace(/[^a-z]/g, "")));

  return parts;
}

/**
 * Normalize a name for fuzzy matching: lowercase, remove accents/diacritics
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

/**
 * Check if a CourtListener case matches an incident by petitioner name.
 * Requires ALL substantial name parts (4+ chars) to appear in
 * the incident's headline or summary, and at least 2 parts must match
 * or the single name must be 6+ chars.
 */
function matchesIncident(
  petitionerNames: string[],
  incident: DBIncident
): boolean {
  const text = [incident.headline ?? "", incident.summary ?? ""]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Filter to substantial name parts
  const substantialNames = petitionerNames
    .map((n) => normalizeName(n))
    .filter((n) => n.length >= 4);

  if (substantialNames.length === 0) return false;

  // ALL substantial name parts must appear in the text
  const allMatch = substantialNames.every((name) => text.includes(name));
  if (!allMatch) return false;

  // Extra confidence check: either need 2+ name parts matching,
  // or the single name must be distinctive (6+ chars)
  if (substantialNames.length === 1 && substantialNames[0].length < 6) {
    return false;
  }

  // Additional guard: check name appears as a word boundary match,
  // not just a substring (e.g. "wang" in "swangy" would be false positive)
  return substantialNames.every((name) => {
    const regex = new RegExp(`\\b${name}\\b`, "i");
    return regex.test(text);
  });
}

async function fetchCL(url: string): Promise<CLResponse> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`CourtListener API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<CLResponse>;
}

function docketUrl(result: CLResult): string {
  return `${COURTLISTENER_BASE}${result.docket_absolute_url}`;
}

function hasAvailableSubstantiveDoc(result: CLResult): boolean {
  return result.recap_documents.some(
    (doc) =>
      doc.is_available &&
      (doc.short_description?.match(/order|injunction|TRO|preliminary/i) ||
        doc.description?.match(
          /order.*(granting|denying|TRO|temporary|preliminary|injunction|release|habeas)/i
        ))
  );
}

function getAvailableDocs(result: CLResult): CLDocument[] {
  return result.recap_documents.filter(
    (doc) =>
      doc.is_available &&
      doc.description?.match(
        /order|injunction|TRO|preliminary|habeas|declaration|petition/i
      )
  );
}

// -- Main --

async function main() {
  console.log(
    `CourtListener RECAP Enrichment${DRY_RUN ? " (DRY RUN)" : ""}${ADD_NEW ? " (+add new)" : ""}\n`
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Load all incidents
  const { rows: incidents } = await client.query<DBIncident>(
    `SELECT id, url, headline, summary, "altSources", date, location
     FROM "Incident"
     WHERE status = 'COMPLETE' AND headline IS NOT NULL
     ORDER BY id`
  );
  console.log(`Loaded ${incidents.length} incidents from database\n`);

  // Also check which CourtListener URLs are already in the DB
  const existingCLUrls = new Set<string>();
  for (const inc of incidents) {
    if (inc.url.includes("courtlistener.com")) existingCLUrls.add(inc.url);
    for (const alt of parseAltSources(inc.altSources)) {
      if (alt.includes("courtlistener.com")) existingCLUrls.add(alt);
    }
  }
  console.log(
    `Found ${existingCLUrls.size} existing CourtListener URLs in DB\n`
  );

  // --- Search strategies ---
  const searches: { label: string; url: string }[] = [
    {
      label: "ND Cal - Sergio Albarran cases",
      url: `${SEARCH_API}?type=r&q=%22Sergio+Albarran%22&court=cand&order_by=dateFiled+desc&format=json`,
    },
    {
      label: "NOS 463 habeas alien detainee (recent, with docs)",
      url: `${SEARCH_API}?type=r&q=%22order+granting%22+%22temporary+restraining%22&nature_of_suit=463&filed_after=2025-06-01&order_by=dateFiled+desc&format=json`,
    },
    {
      label: "Emergency stay of removal motions",
      url: `${SEARCH_API}?type=r&q=%22emergency%22+%22stay+of+removal%22+%22ICE%22&filed_after=2025-01-20&order_by=dateFiled+desc&format=json`,
    },
    {
      label: "Deportation officer declarations (recent)",
      url: `${SEARCH_API}?type=r&q=%22deportation+officer%22+%22declaration%22&nature_of_suit=463&filed_after=2025-06-01&order_by=dateFiled+desc&format=json`,
    },
    {
      label: "ICE deported despite court order",
      url: `${SEARCH_API}?type=r&q=%22deported%22+%22court+order%22+%22violation%22&filed_after=2025-01-20&order_by=dateFiled+desc&format=json`,
    },
    {
      label: "TPS/DACA/withholding habeas cases",
      url: `${SEARCH_API}?type=r&q=%22TPS%22+OR+%22DACA%22+OR+%22withholding+of+removal%22&nature_of_suit=463&filed_after=2025-06-01&order_by=dateFiled+desc&format=json`,
    },
  ];

  const allResults = new Map<number, CLResult>(); // docket_id -> result
  const matchedIncidents: {
    incident: DBIncident;
    clCase: CLResult;
    docketUrl: string;
  }[] = [];
  const unmatchedCases: { clCase: CLResult; docketUrl: string }[] = [];

  // Run searches
  for (const search of searches) {
    console.log(`\n=== ${search.label} ===`);
    try {
      let url: string | null = search.url;
      let pageCount = 0;
      const MAX_PAGES = 5; // Limit pages per search for now

      while (url && pageCount < MAX_PAGES) {
        const data = await fetchCL(url);
        if (pageCount === 0)
          console.log(
            `  Found ${data.count} cases, ${data.document_count} documents`
          );

        for (const result of data.results) {
          if (!allResults.has(result.docket_id)) {
            allResults.set(result.docket_id, result);
          }
        }

        url = data.next;
        pageCount++;
      }
    } catch (err) {
      console.error(`  Error: ${err}`);
    }
  }

  console.log(`\n\nTotal unique cases found: ${allResults.size}\n`);

  // --- Match against DB ---
  console.log("--- Matching cases against existing incidents ---\n");

  for (const [, clCase] of allResults) {
    const petNames = extractPetitionerNames(clCase.caseName);
    if (petNames.length === 0) continue;

    const clUrl = docketUrl(clCase);

    // Skip if already linked
    if (existingCLUrls.has(clUrl)) continue;

    // Try to find a matching incident
    let matched = false;
    for (const incident of incidents) {
      if (matchesIncident(petNames, incident)) {
        matchedIncidents.push({ incident, clCase, docketUrl: clUrl });
        matched = true;
        break;
      }
    }

    if (!matched) {
      unmatchedCases.push({ clCase, docketUrl: clUrl });
    }
  }

  // --- Report matches ---
  console.log(`\n=== MATCHED: ${matchedIncidents.length} cases ===\n`);
  for (const { incident, clCase, docketUrl: url } of matchedIncidents) {
    console.log(`  Incident #${incident.id}: "${incident.headline}"`);
    console.log(`    → ${clCase.caseName} (${clCase.docketNumber})`);
    console.log(`    → ${url}`);

    const availDocs = getAvailableDocs(clCase);
    if (availDocs.length > 0) {
      for (const doc of availDocs.slice(0, 3)) {
        console.log(
          `      📄 ${doc.short_description || doc.description?.slice(0, 80)} (${doc.page_count ?? "?"}p, ${doc.is_available ? "available" : "PACER only"})`
        );
      }
    }
    console.log();

    // Add CourtListener URL to altSources
    if (!DRY_RUN) {
      const existing = parseAltSources(incident.altSources);
      if (!existing.includes(url)) {
        existing.push(url);
        const serialized = serializeAltSources(existing);
        await client.query(
          `UPDATE "Incident" SET "altSources" = $1 WHERE id = $2`,
          [serialized, incident.id]
        );
        console.log(`    ✅ Added docket URL to altSources\n`);
      }
    }
  }

  // --- Report unmatched (potential new incidents) ---
  // Filter to only cases with substantive available documents
  const newWithDocs = unmatchedCases.filter((c) =>
    hasAvailableSubstantiveDoc(c.clCase)
  );
  const newWithoutDocs = unmatchedCases.filter(
    (c) => !hasAvailableSubstantiveDoc(c.clCase)
  );

  console.log(
    `\n=== UNMATCHED WITH AVAILABLE DOCS: ${newWithDocs.length} cases ===\n`
  );
  for (const { clCase, docketUrl: url } of newWithDocs) {
    console.log(
      `  ${clCase.caseName} | ${clCase.docketNumber} | ${clCase.court_id} | filed ${clCase.dateFiled}`
    );
    console.log(`    ${url}`);
    const docs = getAvailableDocs(clCase);
    for (const doc of docs.slice(0, 2)) {
      console.log(
        `    📄 ${doc.short_description || doc.description?.slice(0, 100)}`
      );
    }
    console.log();
  }

  console.log(
    `\n=== UNMATCHED WITHOUT DOCS: ${newWithoutDocs.length} cases (titles only) ===\n`
  );
  for (const { clCase, docketUrl: url } of newWithoutDocs.slice(0, 20)) {
    console.log(
      `  ${clCase.caseName} | ${clCase.docketNumber} | filed ${clCase.dateFiled} | ${url}`
    );
  }
  if (newWithoutDocs.length > 20) {
    console.log(`  ... and ${newWithoutDocs.length - 20} more`);
  }

  // --- Summary ---
  console.log("\n\n=== SUMMARY ===");
  console.log(`Total unique cases searched: ${allResults.size}`);
  console.log(
    `Matched to existing incidents: ${matchedIncidents.length} (docket URLs ${DRY_RUN ? "would be" : ""} added to altSources)`
  );
  console.log(
    `Unmatched with available docs: ${newWithDocs.length} (potential new incidents)`
  );
  console.log(`Unmatched without docs: ${newWithoutDocs.length} (titles only)`);
  console.log(
    `Already linked: ${existingCLUrls.size} CourtListener URLs already in DB`
  );

  await client.end();
}

main().catch(console.error);
