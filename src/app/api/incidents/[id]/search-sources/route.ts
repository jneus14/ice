import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Exa from "exa-js";
import { verifyArticleRelevance } from "@/lib/instagram-pipeline";

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

  // Use both headline and summary for the search query so Exa returns
  // results about the same specific incident, not just keyword matches.
  const parts = [incident.headline, incident.summary].filter(Boolean);
  if (parts.length === 0) {
    return NextResponse.json(
      { error: "No headline or summary to search with" },
      { status: 400 }
    );
  }
  const query = parts.join(". ");

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
      const verified: string[] = [];
      for (const r of candidates) {
        const ok = await verifyArticleRelevance(
          refHeadline,
          refSummary,
          { url: r.url, title: r.title ?? null, text: (r as any).text ?? null },
          anthropicKey
        );
        if (ok) verified.push(r.url);
      }
      newUrls = verified;
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
