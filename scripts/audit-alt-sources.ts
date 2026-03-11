/**
 * Audit all incidents that have alt sources and verify each source
 * actually covers the same specific incident (not just a similar topic).
 *
 * For each mismatched alt source URL:
 *   1. If it matches an existing incident in the DB → add URL to that incident's altSources
 *   2. If it matches no existing incident → create a new RAW incident with that URL
 *   3. Remove the mismatched URL from the original incident's altSources
 *
 * Usage:
 *   npx tsx scripts/audit-alt-sources.ts              # fix everything
 *   npx tsx scripts/audit-alt-sources.ts --dry-run    # preview only
 *   npx tsx scripts/audit-alt-sources.ts --limit=50   # cap incidents processed
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { parseAltSources, serializeAltSources } from "../src/lib/sources";
import { verifyArticleRelevance } from "../src/lib/instagram-pipeline";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "9999"
);

// ── Fetch article text via Exa so we have content to compare ───────────────
async function fetchArticleText(
  url: string
): Promise<{ title: string | null; text: string | null }> {
  // Simple fetch + strip HTML approach (no login required for most news sites)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ICETracker/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { title: null, text: null };
    const html = await res.text();

    // Extract title from <title> or og:title
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<title[^>]*>([^<]{3,200})<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? null;

    // Strip tags, collapse whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    return { title, text };
  } catch {
    return { title: null, text: null };
  }
}

// ── Find existing incident whose URL matches ────────────────────────────────
async function findExistingIncidentByUrl(url: string): Promise<number | null> {
  const hit = await prisma.incident.findFirst({
    where: { url },
    select: { id: true },
  });
  return hit?.id ?? null;
}

// ── Add a URL to an incident's altSources (deduped) ────────────────────────
async function addAltSource(incidentId: number, url: string): Promise<void> {
  const inc = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { altSources: true },
  });
  if (!inc) return;
  const existing = parseAltSources(inc.altSources);
  if (existing.includes(url)) return;
  await prisma.incident.update({
    where: { id: incidentId },
    data: { altSources: serializeAltSources([...existing, url]) },
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not set");

  const incidents = await prisma.incident.findMany({
    where: { altSources: { not: null } },
    select: { id: true, url: true, headline: true, summary: true, altSources: true },
    orderBy: { id: "asc" },
    take: LIMIT,
  });

  // Only incidents that actually have alt sources
  const withSources = incidents.filter((i) => {
    const srcs = parseAltSources(i.altSources);
    return srcs.length > 0;
  });

  console.log(
    `\nAuditing ${withSources.length} incidents with alt sources${DRY_RUN ? " [DRY RUN]" : ""}...\n`
  );

  let totalChecked = 0;
  let totalMismatched = 0;
  let totalMoved = 0;
  let totalCreated = 0;

  for (const incident of withSources) {
    // Some older records have multiple URLs packed into one string with "; " separator.
    // Flatten all of those into individual URL strings before checking.
    const rawUrls = parseAltSources(incident.altSources);
    const altUrls = rawUrls.flatMap((u) =>
      u.includes("; ") ? u.split("; ").map((s) => s.trim()).filter(Boolean) : [u]
    );
    if (altUrls.length === 0) continue;

    const refHeadline = incident.headline ?? "";
    const refSummary = incident.summary ?? "";

    if (!refHeadline && !refSummary) {
      console.log(`  #${incident.id}: no headline/summary to compare — skipping`);
      continue;
    }

    const keepUrls: string[] = [];
    const removeUrls: string[] = [];

    for (const altUrl of altUrls) {
      totalChecked++;
      console.log(`  #${incident.id} checking: ${altUrl}`);

      const { title, text } = await fetchArticleText(altUrl);

      if (!text || text.length < 100) {
        // Can't fetch — keep it, give benefit of the doubt
        console.log(`    → could not fetch, keeping`);
        keepUrls.push(altUrl);
        continue;
      }

      const matches = await verifyArticleRelevance(
        refHeadline,
        refSummary,
        { url: altUrl, title, text },
        anthropicKey
      );

      if (matches) {
        console.log(`    ✓ matches — keep`);
        keepUrls.push(altUrl);
      } else {
        totalMismatched++;
        console.log(`    ✗ MISMATCH — finding home for: ${altUrl}`);
        removeUrls.push(altUrl);

        if (!DRY_RUN) {
          // Does this URL already exist as a primary incident?
          const existingId = await findExistingIncidentByUrl(altUrl);
          if (existingId && existingId !== incident.id) {
            console.log(`    → already exists as incident #${existingId}, skipping alt-source add`);
            totalMoved++;
          } else if (!existingId) {
            // Does any incident already have this as an alt source?
            const alreadyAlt = await prisma.incident.findFirst({
              where: { altSources: { contains: altUrl } },
              select: { id: true },
            });
            if (alreadyAlt && alreadyAlt.id !== incident.id) {
              console.log(`    → already alt source of incident #${alreadyAlt.id}`);
              totalMoved++;
            } else {
              // Create a new RAW incident so the pipeline can process it
              const newInc = await prisma.incident.create({
                data: { url: altUrl, status: "RAW" },
              });
              console.log(`    → created new incident #${newInc.id}`);
              totalCreated++;
            }
          }
        }
      }
    }

    // Update the original incident to remove mismatched URLs
    if (removeUrls.length > 0 && !DRY_RUN) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: { altSources: serializeAltSources(keepUrls) },
      });
      console.log(
        `  #${incident.id}: removed ${removeUrls.length} mismatched URL(s), kept ${keepUrls.length}`
      );
    }
  }

  console.log(`\n── Summary ────────────────────────────────────────`);
  console.log(`  Incidents audited : ${withSources.length}`);
  console.log(`  Alt sources checked: ${totalChecked}`);
  console.log(`  Mismatches found  : ${totalMismatched}`);
  if (!DRY_RUN) {
    console.log(`  Moved / noted     : ${totalMoved}`);
    console.log(`  New incidents created: ${totalCreated}`);
  }
  console.log();

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
