/**
 * Dedup incidents that cover the same person or same event.
 *
 * Strategy:
 * 1. Group incidents by parsedDate (same-day events are likely the same story)
 * 2. For each day with 2+ incidents, ask Claude to identify duplicate groups
 * 3. For each confirmed duplicate group: synthesize headline/summary,
 *    merge all URLs into altSources on the canonical record, delete the rest.
 *
 * Run: npx tsx scripts/dedup-incidents.ts [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

type Incident = {
  id: number;
  url: string;
  altSources: string | null;
  date: string | null;
  parsedDate: Date | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

function parseAltSources(s: string | null): string[] {
  if (!s) return [];
  const t = s.trim();
  if (t.startsWith("[")) {
    try { return JSON.parse(t).filter(Boolean); } catch { return [t]; }
  }
  return [t].filter(Boolean);
}

function serializeAltSources(urls: string[]): string | null {
  const f = urls.map(u => u.trim()).filter(Boolean);
  return f.length > 0 ? JSON.stringify(f) : null;
}

/**
 * Ask Claude to identify which incidents (by index) describe the same event.
 * Returns an array of groups, e.g. [[0,2],[3,5]] means index 0+2 are one
 * incident, index 3+5 are another. Singletons are not included.
 */
async function findDuplicateGroups(
  incidents: Incident[],
  anthropic: Anthropic
): Promise<number[][]> {
  const list = incidents
    .map((inc, i) =>
      `[${i}] headline: "${inc.headline}" | date: ${inc.date} | location: ${inc.location ?? "unknown"}`
    )
    .join("\n");

  const prompt = `You are reviewing a list of immigration enforcement incident reports. Identify which incidents describe the SAME specific event — either because they name the same individual, or because they describe the same event on the same date in the same location.

Incidents:
${list}

Return ONLY a JSON array of duplicate groups. Each group is an array of indices (0-based) that should be merged. Only include groups with 2 or more members. If there are no duplicates return [].

Example: [[0,2],[3,5,7]]

Important: Be conservative. Only group incidents you are highly confident are the same event.`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    // Find the first top-level `[...]` using bracket counting (handles nested arrays + trailing text)
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "[") { if (start === -1) start = i; depth++; }
      else if (text[i] === "]") { if (--depth === 0 && start !== -1) return JSON.parse(text.slice(start, i + 1)); }
    }
    return [];
  } catch {
    console.warn("  Failed to parse Claude response:", text.slice(0, 80));
    return [];
  }
}

/**
 * Ask Claude to synthesize a merged headline and summary from a group of incidents.
 */
async function synthesizeGroup(
  incidents: Incident[],
  anthropic: Anthropic
): Promise<{ headline: string; summary: string }> {
  const sources = incidents
    .map((inc, i) =>
      [
        `--- Source ${i + 1} (${inc.url}) ---`,
        inc.headline ? `Headline: ${inc.headline}` : null,
        inc.summary ? `Summary: ${inc.summary}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  const prompt = `You are a data synthesis assistant. Given multiple news articles about the same immigration enforcement incident, synthesize a single unified headline and summary. Return ONLY valid JSON.

${sources}

{
  "headline": "A short synthesized headline (max 15 words)",
  "summary": "A 3-5 sentence factual summary synthesizing all sources"
}`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  try {
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(cleaned);
  } catch {
    return {
      headline: incidents[0].headline ?? "Untitled",
      summary: incidents[0].summary ?? "",
    };
  }
}

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  console.log(`Starting dedup${DRY_RUN ? " (DRY RUN)" : ""}...`);

  // Load all complete incidents with headlines
  const { rows } = await pg.query<Incident>(`
    SELECT id, url, "altSources", date, "parsedDate", location, headline, summary,
           "incidentType", country, latitude, longitude
    FROM "Incident"
    WHERE headline IS NOT NULL AND status = 'COMPLETE'
    ORDER BY "parsedDate" ASC, id ASC
  `);

  console.log(`Loaded ${rows.length} incidents`);

  // Group by parsedDate (date string, ignore time)
  const byDate = new Map<string, Incident[]>();
  for (const inc of rows) {
    if (!inc.parsedDate) continue;
    const key = new Date(inc.parsedDate).toISOString().split("T")[0];
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(inc);
  }

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const [date, group] of byDate) {
    if (group.length < 2) continue;

    console.log(`\n${date}: ${group.length} incidents — checking for duplicates...`);

    let duplicateGroups: number[][];
    try {
      duplicateGroups = await findDuplicateGroups(group, anthropic);
    } catch (err: any) {
      console.warn(`  Claude failed: ${err.message}`);
      continue;
    }

    if (duplicateGroups.length === 0) {
      console.log(`  No duplicates found`);
      continue;
    }

    for (const indices of duplicateGroups) {
      const dupes = indices.map((i: number) => group[i]).filter(Boolean);
      if (dupes.length < 2) continue;

      console.log(`  Merging ${dupes.length} incidents:`);
      dupes.forEach(d => console.log(`    #${d.id}: ${d.headline}`));

      // Pick canonical: prefer the one with the most complete data
      const canonical = dupes.reduce((best: Incident, cur: Incident) => {
        const score = (b: Incident) =>
          (b.headline ? 2 : 0) + (b.summary ? 2 : 0) + (b.date ? 1 : 0) +
          (b.location ? 1 : 0) + (b.latitude ? 1 : 0);
        return score(cur) > score(best) ? cur : best;
      });
      const others = dupes.filter((d: Incident) => d.id !== canonical.id);

      // Collect all URLs
      const allUrls = new Set<string>();
      for (const inc of dupes) {
        allUrls.add(inc.url);
        for (const s of parseAltSources(inc.altSources)) allUrls.add(s);
      }
      // Remove canonical primary URL from altSources
      allUrls.delete(canonical.url);

      // Synthesize merged headline/summary
      let synthesized: { headline: string; summary: string };
      try {
        synthesized = await synthesizeGroup(dupes, anthropic);
      } catch (err: any) {
        console.warn(`  Synthesis failed: ${err.message}`);
        synthesized = { headline: canonical.headline!, summary: canonical.summary ?? "" };
      }

      console.log(`  → Canonical #${canonical.id}: "${synthesized.headline}"`);
      console.log(`  → Alt sources: ${allUrls.size} URLs`);

      if (!DRY_RUN) {
        await pg.query(
          `UPDATE "Incident" SET
            headline = $1,
            summary = $2,
            "altSources" = $3,
            location = COALESCE($4, location),
            latitude = COALESCE($5::float, latitude),
            longitude = COALESCE($6::float, longitude),
            country = COALESCE($7, country),
            "incidentType" = COALESCE($8, "incidentType")
          WHERE id = $9`,
          [
            synthesized.headline,
            synthesized.summary,
            serializeAltSources(Array.from(allUrls)),
            canonical.location,
            canonical.latitude,
            canonical.longitude,
            canonical.country,
            canonical.incidentType,
            canonical.id,
          ]
        );

        const deleteIds = others.map((o: Incident) => o.id);
        await pg.query(`DELETE FROM "Incident" WHERE id = ANY($1)`, [deleteIds]);
        console.log(`  ✓ Deleted ${deleteIds.length} duplicates`);
      }

      totalMerged++;
      totalDeleted += others.length;
    }
  }

  console.log(`\nDone: ${totalMerged} groups merged, ${totalDeleted} duplicates removed`);
  await pg.end();
}

main().catch(err => { console.error(err); process.exit(1); });
