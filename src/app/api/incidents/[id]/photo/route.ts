import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import Exa from "exa-js";

const EDIT_PASSWORD = "acab";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Extract the best person photo for poster generation.
 * Strategy:
 * 1. Use existing imageUrl from DB
 * 2. Try og:image from linked articles
 * 3. Search Exa for the person's name to find photos
 */
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
    select: { url: true, altSources: true, imageUrl: true, headline: true, summary: true },
  });

  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const results: Array<{ imageUrl: string; source: string }> = [];

  // Strategy 1: Use existing imageUrl from DB
  if (incident.imageUrl) {
    results.push({
      imageUrl: incident.imageUrl,
      source: getDomain(incident.url),
    });
  }

  // Strategy 2: Try og:image from linked articles
  const altUrls = parseAltSources(incident.altSources);
  const articleUrls = [incident.url, ...altUrls].filter(
    (u) =>
      !u.includes("instagram.com") &&
      !u.includes("tiktok.com") &&
      !u.includes(".pdf")
  );

  for (const url of articleUrls.slice(0, 5)) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });

      if (!res.ok) continue;
      const html = await res.text();

      // Try multiple og:image patterns
      const patterns = [
        /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i,
        /content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i,
        /<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i,
        /content=["']([^"']+)["']\s+(?:property|name)=["']twitter:image["']/i,
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
          let imgUrl = match[1];
          if (imgUrl.startsWith("/")) {
            try {
              const u = new URL(url);
              imgUrl = `${u.protocol}//${u.host}${imgUrl}`;
            } catch {
              continue;
            }
          }

          const lower = imgUrl.toLowerCase();
          if (
            lower.includes("logo") ||
            lower.includes("favicon") ||
            lower.includes("icon") ||
            lower.includes("placeholder") ||
            lower.includes("default-share") ||
            lower.includes("site-image") ||
            lower.includes("homeland") ||
            lower.includes("dhs-seal") ||
            lower.includes("department-of") ||
            lower.includes("seal_of") ||
            lower.includes("government") ||
            lower.includes("badge") ||
            lower.includes("generic") ||
            lower.includes("stock-photo") ||
            lower.includes("shutterstock") ||
            lower.includes("getty")
          ) {
            continue;
          }

          // Avoid duplicates
          if (!results.some((r) => r.imageUrl === imgUrl)) {
            results.push({ imageUrl: imgUrl, source: getDomain(url) });
          }
          break;
        }
      }
    } catch {
      // Skip failed URLs
    }
  }

  // Strategy 3: Search Exa broadly for photos of the person
  if (results.length < 5) {
    const exaKey = process.env.EXA_API_KEY;
    if (exaKey) {
      // Extract person name from headline/summary
      const text = `${incident.headline ?? ""} ${incident.summary ?? ""}`;
      const namePatterns = [
        /([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:['"][A-Za-z]+['"]\s+)?(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})(?:\s*,\s*(?:a |an |who |was |is |age ))/,
        /(?:^|\.\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,2})\s+(?:was|has been|is)\s/,
        /(?:detained|deported|arrested|identifies?)\s+(?:as\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,2})/,
      ];
      const stopWords = new Set(["Federal", "Supreme", "Trump", "Biden", "President", "Judge", "Immigration", "Customs", "United", "States", "El", "La", "According", "Human", "American", "National"]);

      let personName: string | null = null;
      for (const p of namePatterns) {
        const m = text.match(p);
        if (m?.[1] && !stopWords.has(m[1].split(" ")[0])) {
          personName = m[1].replace(/['"]/g, "");
          break;
        }
      }

      if (personName) {
        const exa = new Exa(exaKey);
        // Multiple search queries for better coverage
        const queries = [
          `${personName} detained ICE photo`,
          `${personName} immigration`,
          `${personName} family community`,
        ];

        for (const query of queries) {
          if (results.length >= 6) break;
          try {
            const searchResults = await (exa as any).search(query, {
              numResults: 3,
              type: "neural",
            });

            if (searchResults.results) {
              for (const r of searchResults.results) {
                if (!r.url || results.length >= 8) continue;
                try {
                  const res = await fetch(r.url, {
                    headers: {
                      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                      Accept: "text/html",
                    },
                    signal: AbortSignal.timeout(6000),
                    redirect: "follow",
                  });
                  if (!res.ok) continue;
                  const html = await res.text();

                  // Try og:image and twitter:image
                  const imgPatterns = [
                    /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i,
                    /content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i,
                    /<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i,
                    /content=["']([^"']+)["']\s+(?:property|name)=["']twitter:image["']/i,
                  ];

                  for (const pat of imgPatterns) {
                    const ogMatch = html.match(pat);
                    if (ogMatch?.[1]) {
                      const imgUrl = ogMatch[1];
                      const lower = imgUrl.toLowerCase();
                      if (lower.includes("logo") || lower.includes("favicon") || lower.includes("icon") || lower.includes("placeholder") || lower.includes("default") || lower.includes("homeland") || lower.includes("dhs") || lower.includes("seal") || lower.includes("government") || lower.includes("badge") || lower.includes("stock") || lower.includes("getty") || lower.includes("shutterstock")) continue;
                      if (!results.some((x) => x.imageUrl === imgUrl)) {
                        results.push({ imageUrl: imgUrl, source: getDomain(r.url) });
                      }
                      break;
                    }
                  }
                } catch {
                  // Skip
                }
              }
            }
          } catch {
            // Exa query failed, try next
          }
        }
      }
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: "No photos found" }, { status: 404 });
  }

  return NextResponse.json({
    imageUrl: results[0].imageUrl,
    source: results[0].source,
    allPhotos: results,
  });
}
