import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Exa from "exa-js";

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

  const query = incident.headline || incident.summary;
  if (!query) {
    return NextResponse.json(
      { error: "No headline or summary to search with" },
      { status: 400 }
    );
  }

  try {
    const exa = new Exa(exaKey);
    const results = await exa.search(query, {
      numResults: 8,
      type: "keyword",
      excludeDomains: SOCIAL_DOMAINS,
    });

    // Collect existing URLs
    const existingUrls = new Set<string>();
    existingUrls.add(incident.url);
    try {
      const alts = JSON.parse(incident.altSources ?? "[]");
      if (Array.isArray(alts)) alts.forEach((u: string) => existingUrls.add(u));
    } catch {}

    // Filter to new, non-social URLs
    const newUrls = (results.results ?? [])
      .filter(
        (r) =>
          r.url &&
          !existingUrls.has(r.url) &&
          !SOCIAL_DOMAINS.some((d) => r.url.includes(d))
      )
      .map((r) => r.url);

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
