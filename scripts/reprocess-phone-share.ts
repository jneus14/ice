/**
 * Resolves failed incidents with redirect/short/mobile URLs and re-submits them.
 * Handles: short links (trib.al), HTTP→HTTPS, preview URLs, AOL aggregator links.
 * Run: npx tsx scripts/reprocess-phone-share.ts
 */
// @ts-nocheck
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

// URL fixers to try before fetching
function fixUrl(url: string): string {
  // Fix HTTP → HTTPS
  if (url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }
  // Fix EU/regional subdomains of known papers
  url = url.replace(/^https?:\/\/eu\.jsonline\.com/, "https://jsonline.com");
  // Fix Houston Chronicle preview URLs
  url = url.replace(/^https?:\/\/preview-prod\.w\.houstonchronicle\.com/, "https://www.houstonchronicle.com");
  url = url.replace(/^https?:\/\/cmf\.houstonchronicle\.com/, "https://www.houstonchronicle.com");
  // Fix Express-News preview URLs
  url = url.replace(/^https?:\/\/preview-prod\.w\.expressnews\.com/, "https://www.expressnews.com");
  // Fix missing www
  url = url.replace(/^https:\/\/(foxnews\.com|newsweek\.com)/, "https://www.$1");
  return url;
}

// Follow redirects to get the canonical URL
async function resolveUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
    });
    const finalUrl = res.url;
    // Reject if still a short domain or error page
    if (res.status >= 400) return null;
    return finalUrl || url;
  } catch {
    // HEAD failed, try GET
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
      });
      const finalUrl = res.url;
      if (res.status >= 400) return null;
      return finalUrl || url;
    } catch {
      return null;
    }
  }
}

// Domains we can't process (PDFs, court docs, paywalls, etc.)
const SKIP_DOMAINS = [
  "storage.courtlistener.com",
  "courtlistener.com",
  "vasquezlawnc.com", // law firm blog
  "migrantinsider.com",
  "yoursourceone.com",
  "autodeals.lancasteronline.com",
  "appenmedia.com",
  "theatlantic.com", // hard paywall
  "foxnews.com", // skip - not useful
];

async function submitUrl(url: string, key: string): Promise<{ created: boolean; message: string }> {
  try {
    const res = await fetch(`https://hiproject.org/api/submit?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`, {
      method: "GET",
    });
    const data = await res.json();
    if (res.status === 200 || res.status === 201) {
      return { created: true, message: `created id=${data.id ?? "?"}` };
    } else if (res.status === 409) {
      return { created: false, message: "already exists" };
    } else {
      return { created: false, message: `error ${res.status}: ${JSON.stringify(data)}` };
    }
  } catch (err: any) {
    return { created: false, message: `fetch error: ${err.message}` };
  }
}

async function main() {
  const key = process.env.SUBMIT_KEY;
  if (!key) {
    console.error("SUBMIT_KEY not found in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: failed } = await client.query(
    `SELECT id, url FROM "Incident" WHERE status = 'FAILED' ORDER BY id`
  );
  console.log(`Found ${failed.length} FAILED incidents to process\n`);

  let submitted = 0;
  let skipped = 0;
  let errors = 0;
  let resolved = 0;

  for (const row of failed) {
    const originalUrl = row.url || "";

    // Check if domain should be skipped
    const shouldSkip = SKIP_DOMAINS.some((d) => originalUrl.includes(d));
    if (shouldSkip) {
      console.log(`  – skip  #${row.id} (domain blocked): ${originalUrl.slice(0, 70)}`);
      skipped++;
      continue;
    }

    // Try to fix the URL
    const fixedUrl = fixUrl(originalUrl);

    // Resolve redirects
    const canonicalUrl = await resolveUrl(fixedUrl);
    if (!canonicalUrl) {
      console.log(`  ✗ no resolve #${row.id}: ${originalUrl.slice(0, 70)}`);
      errors++;
      continue;
    }

    // If URL changed, log the resolution
    if (canonicalUrl !== originalUrl) {
      console.log(`  → resolved #${row.id}: ${originalUrl.slice(0, 50)} → ${canonicalUrl.slice(0, 50)}`);
      resolved++;
    }

    // Submit the resolved URL
    const { created, message } = await submitUrl(canonicalUrl, key);
    const icon = created ? "✓" : message.includes("already exists") ? "–" : "✗";
    console.log(`  ${icon} #${row.id} ${message.padEnd(20)} ${canonicalUrl.slice(0, 60)}`);

    if (created) {
      submitted++;
      // Mark the original failed incident as superseded (delete it)
      await client.query(`DELETE FROM "Incident" WHERE id = $1`, [row.id]);
    } else if (message.includes("already exists")) {
      skipped++;
      // Also clean up the failed duplicate
      await client.query(`DELETE FROM "Incident" WHERE id = $1`, [row.id]);
    } else {
      errors++;
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nDone: ${submitted} submitted, ${resolved} URLs resolved, ${skipped} skipped/existed, ${errors} errors`);
  await client.end();
}

main().catch(console.error);
