import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import { synthesizeIncidentsWithMismatchDetection, serializeTimeline } from "@/lib/extractor";
import { extractPersonName, nameMatchScore } from "@/lib/name-utils";

const EDIT_PASSWORD = "acab";

/** Extract all person names from text. Finds capitalized multi-word sequences. */
function extractAllPersonNames(text: string): string[] {
  if (!text) return [];
  const namePattern =
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})\b/g;
  const names: string[] = [];
  const stopNames = new Set([
    "United States", "Border Patrol", "White House", "Supreme Court",
    "Federal Court", "Immigration Judge", "Central Louisiana",
    "South Burlington", "Salt Lake", "San Antonio", "Los Angeles",
    "New York", "North Carolina", "South Carolina", "San Diego",
    "San Francisco", "El Salvador", "Costa Rica", "Puerto Rico",
    "Dominican Republic", "Federal Plaza", "District Court",
    "Customs Enforcement", "Homeland Security", "National Guard",
  ]);
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    if (!stopNames.has(name) && name.length > 5) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { headline: true, summary: true, location: true },
  });

  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If keyword param provided, do a simple keyword search instead of name matching
  const keyword = req.nextUrl.searchParams.get("keyword");
  if (keyword && keyword.trim()) {
    const kw = keyword.trim().toLowerCase();
    const keywordResults = await prisma.incident.findMany({
      where: {
        id: { not: id },
        status: "COMPLETE",
        headline: { not: null },
        OR: [
          { headline: { contains: keyword.trim(), mode: "insensitive" } },
          { summary: { contains: keyword.trim(), mode: "insensitive" } },
        ],
      },
      orderBy: { parsedDate: "desc" },
      take: 15,
      select: {
        id: true,
        headline: true,
        date: true,
        location: true,
        approved: true,
      },
    });

    const candidates = keywordResults.map((e) => ({
      id: e.id,
      headline: e.headline ?? "",
      date: e.date,
      location: e.location,
      score: 0.5,
      approved: e.approved,
    }));

    return NextResponse.json({ candidates });
  }

  // Extract names from BOTH headline and summary
  const headlineName = extractPersonName(incident.headline ?? "");
  const summaryNames = extractAllPersonNames(incident.summary ?? "");
  const allSourceNames = [headlineName, ...summaryNames].filter(
    Boolean
  ) as string[];

  const loc1 = (incident.location ?? "").toLowerCase().trim();

  const stopwords = new Set([
    "after", "with", "from", "that", "this", "their", "about", "been",
    "have", "were", "they", "will", "would", "could", "should", "during",
    "before", "while", "under", "between", "through", "against", "without",
    "within", "also", "than", "more", "said", "says", "according", "told",
    "over", "into", "being", "which", "when", "where", "some", "other",
    "year", "years", "people", "including", "since", "states", "united",
    "federal", "immigration", "detained", "detention", "agents", "enforcement",
  ]);
  function getKeywords(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^a-záéíóúñü]/g, ""))
        .filter((w) => w.length > 3 && !stopwords.has(w))
    );
  }

  // Combine headline + summary keywords for richer matching
  const words1 = getKeywords(
    (incident.headline ?? "") + " " + (incident.summary ?? "")
  );

  // Search existing incidents — include summary for matching (capped for performance)
  const existing = await prisma.incident.findMany({
    where: {
      id: { not: id },
      status: "COMPLETE",
      headline: { not: null },
    },
    orderBy: { parsedDate: "desc" },
    take: 500,
    select: {
      id: true,
      headline: true,
      summary: true,
      date: true,
      location: true,
      approved: true,
    },
  });

  const scored = existing
    .map((e) => {
      let score = 0;
      const existingSummary = e.summary ?? "";
      const existingFullText = (e.headline ?? "") + " " + existingSummary;

      // Name-based matching: check all names from source against headline + summary of existing
      const existingHeadlineName = extractPersonName(e.headline ?? "");
      const existingSummaryNames = extractAllPersonNames(existingSummary);
      const allExistingNames = [
        existingHeadlineName,
        ...existingSummaryNames,
      ].filter(Boolean) as string[];

      // Find best name match across all name pairs
      for (const srcName of allSourceNames) {
        for (const existName of allExistingNames) {
          const s = nameMatchScore(srcName, existName);
          if (s > score) score = s;
        }
      }

      // Also check if any source name appears as substring in existing full text
      if (score < 0.5) {
        const existingLower = existingFullText.toLowerCase();
        for (const srcName of allSourceNames) {
          const nameLower = srcName.toLowerCase();
          if (existingLower.includes(nameLower)) {
            score = Math.max(score, 0.9);
          } else {
            // Check first name + any surname
            const parts = nameLower.split(/\s+/);
            if (parts.length >= 2) {
              const firstName = parts[0];
              const surnames = parts.slice(1);
              const firstMatch = existingLower.includes(firstName);
              const surnameMatch = surnames.some(
                (s) => s.length > 3 && existingLower.includes(s)
              );
              if (firstMatch && surnameMatch) {
                score = Math.max(score, 0.75);
              }
            }
          }
        }
      }

      // Keyword overlap using full text (headline + summary)
      if (score < 0.5) {
        const words2 = getKeywords(existingFullText);
        const overlap = [...words1].filter((w) => words2.has(w)).length;
        const minWords = Math.min(words1.size, words2.size);
        if (minWords > 0) {
          const wordScore = overlap / minWords;
          const loc2 = (e.location ?? "").toLowerCase().trim();
          const locMatch =
            loc1 &&
            loc2 &&
            (loc1.includes(loc2) || loc2.includes(loc1) || loc1 === loc2);
          const locationBoost = locMatch ? 0.15 : 0;
          const keywordScore = Math.min(wordScore * 0.8 + locationBoost, 0.95);
          score = Math.max(score, keywordScore);
        }
      }

      return {
        id: e.id,
        headline: e.headline ?? "",
        date: e.date,
        location: e.location,
        score,
        approved: e.approved,
      };
    })
    .filter((c) => c.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return NextResponse.json({ candidates: scored });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const newId = parseInt(idStr, 10);
  if (isNaN(newId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const existingId = body.existingId;
  if (!existingId || typeof existingId !== "number") {
    return NextResponse.json(
      { error: "existingId required" },
      { status: 400 }
    );
  }

  // Fetch both incidents
  const incidents = await prisma.incident.findMany({
    where: { id: { in: [existingId, newId] } },
  });

  if (incidents.length < 2) {
    return NextResponse.json(
      { error: "Incidents not found" },
      { status: 404 }
    );
  }

  const primary = incidents.find((i) => i.id === existingId)!;
  const secondary = incidents.find((i) => i.id === newId)!;

  // Collect all URLs
  const existingAlt = parseAltSources(primary.altSources);
  const newAlt = parseAltSources(secondary.altSources);
  const allUrls = [primary.url, ...existingAlt, secondary.url, ...newAlt];
  const uniqueUrls = [...new Set(allUrls)].filter((u) => u !== primary.url);

  // Synthesize with mismatch detection
  const sources = [primary, secondary].map((i) => ({
    url: i.url,
    headline: i.headline,
    summary: i.summary,
    date: i.date,
  }));

  const result = await synthesizeIncidentsWithMismatchDetection(sources);

  if (result.mismatch) {
    // Sources are about different incidents — don't merge
    return NextResponse.json(
      { error: "Sources describe different incidents and cannot be merged", mismatch: true },
      { status: 409 }
    );
  }

  const { headline, summary, timeline } = result;

  // Use original date for sorting, not timeline dates
  const latestParsedDate = primary.parsedDate;

  // Update primary with merged data
  await prisma.incident.update({
    where: { id: primary.id },
    data: {
      altSources: uniqueUrls.length > 0 ? JSON.stringify(uniqueUrls) : null,
      headline,
      summary,
      timeline: serializeTimeline(timeline),
      parsedDate: latestParsedDate,
      status: "COMPLETE",
      approved: true,
      location: primary.location || secondary.location,
      latitude: primary.latitude || secondary.latitude,
      longitude: primary.longitude || secondary.longitude,
      country: primary.country || secondary.country,
      incidentType: primary.incidentType || secondary.incidentType,
    },
  });

  // Delete the secondary
  await prisma.incident.delete({ where: { id: newId } });

  return NextResponse.json({ success: true, survivingId: primary.id });
}
