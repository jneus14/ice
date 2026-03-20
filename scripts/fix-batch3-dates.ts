/**
 * 1. Fixes #1788 (Disney World story) date to February 2026
 * 2. Clears bogus "null" string dates to actual NULL on batch 3 incidents
 *    so the backfill-instagram-dates script can pick them up
 * 3. Decodes Instagram shortcodes to get approximate post dates for any
 *    remaining NULL-date incidents in the batch
 */
// @ts-nocheck
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

// Instagram shortcode → approximate post date
// Shortcode chars use base64url alphabet: A-Za-z0-9-_
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const INSTAGRAM_EPOCH_MS = BigInt(1314220021721); // Aug 25, 2011

function shortcodeToDate(url: string): string | null {
  try {
    const m = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const code = m[1];
    let n = BigInt(0);
    for (const ch of code) {
      const idx = ALPHABET.indexOf(ch);
      if (idx === -1) break;
      n = n * BigInt(64) + BigInt(idx);
    }
    const tsMs = (n >> BigInt(23)) + INSTAGRAM_EPOCH_MS;
    const date = new Date(Number(tsMs));
    // Sanity check: must be between 2020 and 2027
    if (date.getFullYear() < 2020 || date.getFullYear() > 2027) return null;
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Fix Disney World story (#1788) — should be February 2026
  await client.query(
    `UPDATE "Incident" SET date = '2/2026', "parsedDate" = '2026-02-01' WHERE id = 1788`
  );
  console.log("✓ #1788 Disney World story → 2026-02-01");

  // 2. Get all batch 3 COMPLETE incidents with "null" string date or NULL parsedDate
  const { rows } = await client.query(
    `SELECT id, url, date, "parsedDate", headline
     FROM "Incident"
     WHERE id >= 1741 AND id <= 1799 AND status = 'COMPLETE'
       AND ("parsedDate" IS NULL OR date = 'null' OR date IS NULL)
     ORDER BY id`
  );

  console.log(`\nFound ${rows.length} incidents needing date fixes:\n`);

  let fixed = 0;
  for (const r of rows) {
    if (r.id === 1788) continue; // already fixed above

    // Decode date from Instagram shortcode
    const decoded = shortcodeToDate(r.url || "");
    if (decoded) {
      const parsedDate = new Date(decoded);
      await client.query(
        `UPDATE "Incident" SET date = $1, "parsedDate" = $2 WHERE id = $3`,
        [decoded, parsedDate, r.id]
      );
      console.log(`  ✓ #${r.id} → ${decoded}  "${r.headline?.slice(0, 60)}"`);
      fixed++;
    } else {
      // Clear "null" string to real NULL so backfill script can handle it
      if (r.date === "null") {
        await client.query(
          `UPDATE "Incident" SET date = NULL WHERE id = $1`,
          [r.id]
        );
        console.log(`  – #${r.id} cleared 'null' string → NULL  "${r.headline?.slice(0, 60)}"`);
      } else {
        console.log(`  ? #${r.id} no shortcode date, date="${r.date}"  "${r.headline?.slice(0, 60)}"`);
      }
    }
  }

  console.log(`\nFixed ${fixed} dates via shortcode decoding. Run backfill-instagram-dates for remaining.`);
  await client.end();
}

main();
export {};
