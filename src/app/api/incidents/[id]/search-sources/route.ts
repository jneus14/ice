import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Exa from "exa-js";
import { verifyArticleRelevance } from "@/lib/instagram-pipeline";

export const maxDuration = 60; // seconds — override default 10s serverless timeout

const EDIT_PASSWORD = "acab";
const SOCIAL_DOMAINS = [
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "threads.net",
  "reddit.com",
  "youtube.com",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { headline: true, summary: true, url: true, altSources: true },
  });

  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!incident.headline && !incident.summary) {
    return NextResponse.json(
      { error: "No headline or summary to search with" },
      { status: 400 }
    );
  }

  // Build query: headline + any person names found in the summary.
  // Full summary is too broad (matches unrelated ICE stories); names keep
  // the query specific without bloating it.
  const STOP_NAMES = new Set([
    "United States", "Border Patrol", "White House", "Supreme Court",
    "Federal Court", "Immigration Judge", "Department of Homeland",
    "Homeland Security", "Customs Enforcement", "National Guard",
    "Immigration and Customs",
  ]);
  function extractNames(text: string): string[] {
    const pattern = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})\b/g;
    const names: string[] = [];
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const name = m[1];
      if (!STOP_NAMES.has(name) && name.length > 5) names.push(name);
    }
    return [...new Set(names)];
  }

  const summaryNames = extractNames(incident.summary ?? "");
  const queryParts = [incident.headline, ...summaryNames].filter(Boolean);
  const query = queryParts.join(" ");

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    const exa = new Exa(exaKey);
    const results = await exa.search(query, {
      numResults: 8,
      type: "neural",
      excludeDomains: SOCIAL_DOMAINS,
      contents: { text: { maxCharacters: 3000 } },
    });

    // Collect existing URLs
    const existingUrls = new Set<string>();
    existingUrls.add(incident.url);
    try {
      const alts = JSON.parse(incident.altSources ?? "[]");
      if (Array.isArray(alts)) alts.forEach((u: string) => existingUrls.add(u));
    } catch {}

    // Filter to new, non-social URLs
    const candidates = (results.results ?? [])
      .filter(
        (r: any) =>
          r.url &&
          !existingUrls.has(r.url) &&
          !SOCIAL_DOMAINS.some((d) => r.url.includes(d))
      );

    // Verify each candidate actually covers the same specific incident
    const refHeadline = incident.headline || "";
    const refSummary = incident.summary || "";
    let newUrls: string[];

    if (anthropicKey && refHeadline) {
      // Run verifications in parallel to avoid serial Claude call timeouts
      const results = await Promise.all(
        candidates.map((r) =>
          verifyArticleRelevance(
            refHeadline,
            refSummary,
            { url: r.url, title: r.title ?? null, text: (r as any).text ?? null },
            anthropicKey
          ).then((ok) => (ok ? r.url : null))
        )
      );
      newUrls = results.filter((u): u is string => u !== null);
    } else {
      // No Anthropic key or no headline — fall back to unverified results
      newUrls = candidates.map((r: any) => r.url);
    }

    if (newUrls.length === 0) {
      return NextResponse.json({ added: 0, message: "No new sources found" });
    }

    // Merge with existing altSources
    const currentAlts: string[] = [];
    try {
      const parsed = JSON.parse(incident.altSources ?? "[]");
      if (Array.isArray(parsed)) currentAlts.push(...parsed);
    } catch {}

    const merged = [...new Set([...currentAlts, ...newUrls])];

    await prisma.incident.update({
      where: { id },
      data: { altSources: JSON.stringify(merged) },
    });

    return NextResponse.json({ added: newUrls.length, total: merged.length });
  } catch (e: any) {
    if (e.message?.includes("exceeded your credits")) {
      return NextResponse.json(
        { error: "Exa API credits exhausted" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e.message?.substring(0, 100) ?? "Search failed" },
      { status: 500 }
    );
  }
}
