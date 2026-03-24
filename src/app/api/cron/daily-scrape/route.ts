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
import { clusterIncidents } from "@/lib/cluster";
import { synthesizeIncidents, serializeTimeline } from "@/lib/extractor";
import { parseAltSources } from "@/lib/sources";
import { parseIncidentDate } from "@/lib/geocode";

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
  }

  // Process all pipelines and wait for them to complete
  const pipelineResults = await Promise.allSettled(
    newIds.map((id) => processIncidentPipeline(id))
  );

  const failed = pipelineResults.filter((r) => r.status === "rejected").length;
  console.log(`[daily-scrape] Pipelines: ${created - failed} succeeded, ${failed} failed`);

  // Auto-cluster: find new pending incidents that cover the same event and merge them
  let merged = 0;
  try {
    const pendingNew = await prisma.incident.findMany({
      where: { id: { in: newIds }, status: "COMPLETE", approved: false, headline: { not: null } },
      select: { id: true, headline: true, date: true, location: true, summary: true },
    });

    if (pendingNew.length >= 2) {
      const clusters = clusterIncidents(pendingNew);
      console.log(`[daily-scrape] Found ${clusters.length} cluster(s) among ${pendingNew.length} new stories`);

      for (const cluster of clusters) {
        try {
          const incidents = await prisma.incident.findMany({
            where: { id: { in: cluster.ids } },
          });
          if (incidents.length < 2) continue;

          // Sort by date descending — most recent first
          incidents.sort((a, b) => {
            const da = a.parsedDate?.getTime() ?? 0;
            const db = b.parsedDate?.getTime() ?? 0;
            return db - da;
          });

          const primary = incidents[0];
          const others = incidents.slice(1);

          // Collect all URLs
          const allUrls = new Set<string>();
          for (const inc of incidents) {
            allUrls.add(inc.url);
            for (const alt of parseAltSources(inc.altSources)) allUrls.add(alt);
          }
          const altUrls = [...allUrls].filter((u) => u !== primary.url);

          // Synthesize
          const sources = incidents.map((i) => ({
            url: i.url, headline: i.headline, summary: i.summary, date: i.date,
          }));
          const synth = await synthesizeIncidents(sources).catch(() => ({
            headline: primary.headline || "Untitled",
            summary: incidents.map((i) => i.summary).filter(Boolean).join(" "),
            timeline: [] as Array<{ date: string; event: string; source?: string }>,
          }));

          const bestDate = primary.date || others.find((i) => i.date)?.date || null;

          // Merge tags
          const allTags = new Set<string>();
          for (const inc of incidents) {
            if (inc.incidentType) {
              for (const t of inc.incidentType.split(",").map((s) => s.trim()).filter(Boolean)) {
                allTags.add(t);
              }
            }
          }

          await prisma.incident.update({
            where: { id: primary.id },
            data: {
              headline: synth.headline,
              summary: synth.summary,
              timeline: serializeTimeline(synth.timeline),
              altSources: altUrls.length > 0 ? JSON.stringify(altUrls) : null,
              date: bestDate,
              parsedDate: parseIncidentDate(bestDate),
              location: primary.location || others.find((i) => i.location)?.location,
              latitude: primary.latitude || others.find((i) => i.latitude)?.latitude,
              longitude: primary.longitude || others.find((i) => i.longitude)?.longitude,
              country: primary.country || others.find((i) => i.country)?.country,
              incidentType: allTags.size > 0 ? [...allTags].join(", ") : null,
              imageUrl: primary.imageUrl || others.find((i) => i.imageUrl)?.imageUrl,
            },
          });

          await prisma.incident.deleteMany({
            where: { id: { in: others.map((i) => i.id) } },
          });

          merged += others.length;
          console.log(`[daily-scrape] Merged ${incidents.length} stories → #${primary.id}: "${synth.headline?.slice(0, 60)}"`);
        } catch (err: any) {
          console.warn(`[daily-scrape] Cluster merge failed:`, err.message);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[daily-scrape] Auto-clustering failed:`, err.message);
  }

  console.log(`[daily-scrape] Done: ${created} new, ${skipped} duplicates, ${merged} auto-merged`);
  return NextResponse.json({ created, skipped, merged, ids: newIds });
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
