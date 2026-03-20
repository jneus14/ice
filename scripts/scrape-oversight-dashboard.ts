import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const API_URL = "https://oversightdemocrats.house.gov/cfc_extensions/data/events_db.cfc";
const PAGE_SIZE = 100;

interface DashboardEntry {
  title: string;
  url: string;
  date: string;
  category: string;
  location: string;
}

async function fetchPage(start: number, length: number): Promise<{ data: any[]; total: number }> {
  const params = new URLSearchParams({
    method: "getIncidentEventsTable",
    start: String(start),
    length: String(length),
    "search[value]": "",
    draw: "1",
    "order[0][column]": "1",
    "order[0][dir]": "desc",
  });

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Referer": "https://oversightdemocrats.house.gov/immigration-dashboard",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`API returned ${res.status}: ${await res.text()}`);
  }

  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty response");
  const json = JSON.parse(trimmed);
  // ColdFusion returns { DATA: [...], RECORDSTOTAL: n } (uppercase keys)
  return {
    data: json.DATA || json.data || [],
    total: json.RECORDSTOTAL || json.recordsTotal || json.RECORDSFILTEREDCOUNT || 0,
  };
}

function extractUrl(html: string): string | null {
  const match = html.match(/href="([^"]+)"/);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

async function main() {
  console.log("Fetching oversight dashboard entries...\n");

  // First request to get total count
  let allEntries: DashboardEntry[] = [];
  let total = 0;
  let start = 0;

  do {
    try {
      const result = await fetchPage(start, PAGE_SIZE);
      if (!total) total = result.total;

      for (const row of result.data) {
        // ColdFusion returns objects with title_html, event_date, location, category, state
        const titleHtml = row.title_html || row.TITLE_HTML || "";
        const url = extractUrl(titleHtml);
        if (url) {
          allEntries.push({
            title: stripHtml(titleHtml),
            url: url.startsWith("http") ? url : `https://oversightdemocrats.house.gov${url}`,
            date: row.event_date || row.EVENT_DATE || "",
            category: row.category || row.CATEGORY || "",
            location: row.location || row.LOCATION || "",
          });
        }
      }

      console.log(`Fetched ${start + result.data.length}/${total || '?'} entries`);
      start += PAGE_SIZE;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      console.error(`Error at offset ${start}: ${err.message}`);
      break;
    }
  } while (total ? start < total : allEntries.length === start);

  console.log(`\nTotal extracted: ${allEntries.length} URLs\n`);

  // Write all URLs to a file for the submission script
  const fs = await import("fs");
  const urlList = allEntries.map((e) => e.url);
  fs.writeFileSync("/tmp/oversight-urls.json", JSON.stringify(urlList, null, 2));
  console.log("Saved URLs to /tmp/oversight-urls.json");

  // Now cross-reference with existing DB
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const incidents = await prisma.incident.findMany({ select: { url: true, altSources: true } });
  const existingUrls = new Set<string>();
  for (const i of incidents) {
    try {
      const p = new URL(i.url);
      existingUrls.add(p.hostname.replace(/^www\./, "") + p.pathname.replace(/\/$/, ""));
    } catch {}
    if (i.altSources) {
      try {
        const alts = JSON.parse(i.altSources);
        for (const a of alts) {
          try {
            const p = new URL(a);
            existingUrls.add(p.hostname.replace(/^www\./, "") + p.pathname.replace(/\/$/, ""));
          } catch {}
        }
      } catch {}
    }
  }

  console.log(`Existing DB URLs (normalized): ${existingUrls.size}`);

  // Find new URLs
  const newUrls: string[] = [];
  for (const entry of allEntries) {
    try {
      const p = new URL(entry.url);
      const normalized = p.hostname.replace(/^www\./, "") + p.pathname.replace(/\/$/, "");
      if (!existingUrls.has(normalized)) {
        newUrls.push(entry.url);
      }
    } catch {}
  }

  console.log(`New URLs not in DB: ${newUrls.length}\n`);

  // Submit new URLs
  const key = process.env.SUBMIT_KEY;
  if (!key) {
    console.error("SUBMIT_KEY not found");
    await prisma.$disconnect();
    return;
  }

  let created = 0,
    skipped = 0,
    errors = 0;
  for (const url of newUrls) {
    try {
      const res = await fetch(
        `https://hiproject.org/api/submit?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`,
        { method: "GET" }
      );
      const data = await res.json();
      if (data.queued) {
        created++;
        console.log(`✓ Created #${data.id}: ${url.slice(0, 80)}`);
      } else if (data.duplicate) {
        skipped++;
      } else {
        errors++;
        console.log(`✗ Error: ${JSON.stringify(data).slice(0, 100)}`);
      }
    } catch (err: any) {
      errors++;
      console.log(`✗ Fetch error: ${err.message}`);
    }
    // Throttle to avoid overwhelming the pipeline
    await new Promise((r) => setTimeout(r, created > 0 ? 1000 : 200));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
  await prisma.$disconnect();
}

main().catch(console.error);
