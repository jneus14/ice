import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Exa from "exa-js";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-password") !== "acab") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY not configured" },
      { status: 500 }
    );
  }

  const incidents = await prisma.incident.findMany({
    where: {
      headline: { not: null },
      status: "COMPLETE",
      OR: [{ altSources: null }, { altSources: "[]" }, { altSources: "" }],
    },
    select: { id: true, headline: true, url: true },
    orderBy: { id: "desc" },
  });

  const exa = new Exa(exaKey);
  let updated = 0;
  let totalSources = 0;
  const errors: string[] = [];

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    try {
      const results = await exa.search(inc.headline!, {
        numResults: 5,
        type: "keyword",
        excludeDomains: SOCIAL_DOMAINS,
      });

      const newsUrls = (results.results || [])
        .filter(
          (r) =>
            r.url &&
            r.url !== inc.url &&
            !SOCIAL_DOMAINS.some((d) => r.url.includes(d))
        )
        .map((r) => r.url);

      if (newsUrls.length > 0) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { altSources: JSON.stringify(newsUrls) },
        });
        updated++;
        totalSources += newsUrls.length;
      }
    } catch (e: any) {
      if (e.message?.includes("429") || e.message?.includes("rate")) {
        await sleep(3000);
        i--; // retry
        continue;
      }
      errors.push(`[${inc.id}] ${e.message?.substring(0, 80)}`);
    }

    await sleep(300);
  }

  return NextResponse.json({
    total_incidents: incidents.length,
    updated,
    sources_added: totalSources,
    errors: errors.length > 0 ? errors : undefined,
  });
}
