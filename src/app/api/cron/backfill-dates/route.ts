import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import { parseIncidentDate } from "@/lib/geocode";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const DATE_PATTERNS = [
  /"datePublished"\s*:\s*"([^"]+)"/,
  /"dateCreated"\s*:\s*"([^"]+)"/,
  /property="article:published_time"\s+content="([^"]+)"/,
  /content="([^"]+)"\s+property="article:published_time"/,
  /name="date"\s+content="([^"]+)"/,
  /name="publish.date"\s+content="([^"]+)"/,
  /name="pubdate"\s+content="([^"]+)"/,
  /<time[^>]+datetime="([^"]+)"/,
  /property="og:updated_time"\s+content="([^"]+)"/,
];

async function fetchDateFromUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();

    for (const pat of DATE_PATTERNS) {
      const match = html.match(pat);
      if (match) {
        const d = new Date(match[1]);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2024 && d <= new Date()) {
          return d.toISOString().slice(0, 10); // YYYY-MM-DD
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-password") !== "acab") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: string) {
        controller.enqueue(encoder.encode(msg + "\n"));
      }

      try {
        const incidents = await prisma.incident.findMany({
          where: {
            headline: { not: null },
            approved: false,
            OR: [{ date: null }, { date: "" }],
          },
          select: {
            id: true,
            headline: true,
            url: true,
            altSources: true,
          },
          orderBy: { id: "desc" },
        });

        send(`Found ${incidents.length} incidents missing dates`);

        let updated = 0;
        let noDate = 0;

        for (let i = 0; i < incidents.length; i++) {
          const inc = incidents[i];
          const label = `[${i + 1}/${incidents.length}] #${inc.id}`;

          // Collect all fetchable URLs: primary URL + alt sources, skip social media
          const SOCIAL = ["instagram.com", "twitter.com", "x.com", "facebook.com", "tiktok.com"];
          const allUrls: string[] = [];
          if (inc.url && !SOCIAL.some((d) => inc.url!.includes(d))) {
            allUrls.push(inc.url);
          }
          allUrls.push(
            ...parseAltSources(inc.altSources).filter(
              (u) => !SOCIAL.some((d) => u.includes(d))
            )
          );

          if (allUrls.length === 0) {
            noDate++;
            send(`${label}: no fetchable URLs`);
            continue;
          }

          let foundDate: string | null = null;

          for (const url of allUrls.slice(0, 3)) {
            send(`${label}: fetching ${url.slice(0, 80)}...`);
            foundDate = await fetchDateFromUrl(url);
            if (foundDate) break;
            await sleep(300);
          }

          if (!foundDate) {
            noDate++;
            send(`${label}: no date in HTML meta tags`);
            continue;
          }

          const parsedDate = parseIncidentDate(foundDate);

          await prisma.incident.update({
            where: { id: inc.id },
            data: {
              date: foundDate,
              ...(parsedDate ? { parsedDate } : {}),
            },
          });

          updated++;
          send(`${label}: ${foundDate}  "${inc.headline?.slice(0, 60)}"`);
        }

        send(
          `\nDone! Updated ${updated}/${incidents.length} incidents (${noDate} had no extractable date)`
        );
      } catch (e: any) {
        send(`Fatal error: ${e.message}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
