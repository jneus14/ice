/**
 * Daily scrape endpoint — searches Exa for recent ICE/immigration enforcement
 * news articles, deduplicates against existing incidents, creates new RAW
 * incidents, and kicks off the pipeline on each.
 *
 * Protected by SUBMIT_KEY.
 * Call via GET or POST:
 *   GET /api/cron/daily-scrape?key=<SUBMIT_KEY>
 *   POST /api/cron/daily-scrape  (Authorization: Bearer <SUBMIT_KEY>)
 *
 * Schedule with Railway Cron or any external cron service (e.g. cron-job.org).
 */
import { NextRequest, NextResponse } from "next/server";
import Exa from "exa-js";
import { prisma } from "@/lib/db";
import { processIncidentPipeline } from "@/lib/pipeline";

// Search queries tuned to surface news articles about specific ICE enforcement incidents
const SEARCH_QUERIES = [
  "ICE arrested immigrant detained",
  "ICE raid immigration enforcement arrested",
  "deported ICE immigration custody",
  "immigration customs enforcement detained person",
  "ICE detainee detained arrested",
];

// How many days back to search (2 = yesterday + today)
const LOOKBACK_DAYS = 2;

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "threads.net",
];

function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SOCIAL_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return SOCIAL_DOMAINS.some((d) => url.includes(d));
  }
}

function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return raw;
  }
}

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  const submitKey = process.env.SUBMIT_KEY;
  if (!submitKey) {
    return NextResponse.json({ error: "SUBMIT_KEY not configured" }, { status: 503 });
  }

  const providedKey =
    req.nextUrl.searchParams.get("key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!providedKey || providedKey !== submitKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return NextResponse.json({ error: "EXA_API_KEY not configured" }, { status: 503 });
  }

  const exa = new Exa(exaKey);

  // Build start date: LOOKBACK_DAYS ago in ISO format
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);
  const startPublishedDate = startDate.toISOString().split("T")[0];

  console.log(`[daily-scrape] Searching for articles since ${startPublishedDate}...`);

  // Collect all candidate URLs across all queries
  const candidateUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const results = await (exa as any).search(query, {
        numResults: 10,
        type: "keyword",
        startPublishedDate,
        excludeDomains: SOCIAL_DOMAINS,
        contents: { text: false },
      });
      for (const r of (results.results ?? []) as { url: string }[]) {
        if (r.url && !isSocialUrl(r.url)) {
          candidateUrls.add(cleanUrl(r.url));
        }
      }
    } catch (err: any) {
      console.warn(`[daily-scrape] Exa search failed for "${query}":`, err.message);
    }
  }

  console.log(`[daily-scrape] Found ${candidateUrls.size} unique candidate URLs`);

  let created = 0;
  let skipped = 0;
  const newIds: number[] = [];

  for (const url of candidateUrls) {
    // Skip if URL already exists as a primary incident URL
    const existing = await prisma.incident.findFirst({
      where: { url },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Create new RAW incident
    const incident = await prisma.incident.create({ data: { url, status: "RAW" } });
    newIds.push(incident.id);
    created++;

    // Fire-and-forget pipeline
    processIncidentPipeline(incident.id).catch((err: any) => {
      console.error(`[daily-scrape] Pipeline failed for #${incident.id}:`, err.message);
    });
  }

  console.log(`[daily-scrape] Done: ${created} new, ${skipped} duplicates`);
  return NextResponse.json({ created, skipped, ids: newIds });
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
