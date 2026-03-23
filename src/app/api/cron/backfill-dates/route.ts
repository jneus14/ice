import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import { parseIncidentDate } from "@/lib/geocode";
import Exa from "exa-js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-password") !== "acab") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return new Response(
      JSON.stringify({ error: "EXA_API_KEY not configured" }),
      { status: 500 }
    );
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
            url: { contains: "instagram.com" },
            headline: { not: null },
            approved: false,
            OR: [{ date: null }, { date: "" }],
          },
          select: {
            id: true,
            headline: true,
            altSources: true,
          },
          orderBy: { id: "desc" },
        });

        send(`Found ${incidents.length} Instagram incidents missing dates`);

        const exa = new Exa(exaKey);
        let updated = 0;
        let noDate = 0;

        for (let i = 0; i < incidents.length; i++) {
          const inc = incidents[i];
          const label = `[${i + 1}/${incidents.length}] #${inc.id}`;

          try {
            let rawDate: string | null = null;

            // Strategy 1: get publishedDate from existing alt sources via Exa
            const altUrls = parseAltSources(inc.altSources).filter(
              (u) => !u.includes("instagram.com")
            );

            if (altUrls.length > 0) {
              try {
                const contents = await (exa as any).getContents(
                  altUrls.slice(0, 3),
                  { text: { maxCharacters: 500 } }
                );
                for (const r of contents.results ?? []) {
                  if (r.publishedDate) {
                    rawDate = r.publishedDate;
                    break;
                  }
                }
              } catch {
                // fall through to search
              }
            }

            // Strategy 2: search Exa by headline
            if (!rawDate && inc.headline) {
              try {
                const results = await (exa as any).search(
                  `"${inc.headline.slice(0, 120)}"`,
                  {
                    numResults: 3,
                    type: "news",
                    excludeDomains: [
                      "instagram.com",
                      "facebook.com",
                      "twitter.com",
                      "x.com",
                    ],
                    contents: { text: { maxCharacters: 500 } },
                  }
                );
                for (const r of results.results ?? []) {
                  if (r.publishedDate) {
                    rawDate = r.publishedDate;
                    break;
                  }
                }
              } catch {
                // no results
              }
            }

            if (!rawDate) {
              noDate++;
              send(`${label}: no date found`);
              await sleep(300);
              continue;
            }

            // Parse and save
            const dateStr = rawDate.slice(0, 10); // YYYY-MM-DD
            const parsedDate = parseIncidentDate(dateStr);

            await prisma.incident.update({
              where: { id: inc.id },
              data: {
                date: dateStr,
                ...(parsedDate ? { parsedDate } : {}),
              },
            });

            updated++;
            send(
              `${label}: ${dateStr}  "${inc.headline?.slice(0, 60)}"`
            );
          } catch (e: any) {
            if (e.message?.includes("429") || e.message?.includes("rate")) {
              send(`Rate limited, waiting 3s...`);
              await sleep(3000);
              i--;
              continue;
            }
            send(`${label} ERROR: ${e.message?.slice(0, 80)}`);
          }

          await sleep(300);
        }

        send(
          `\nDone! Updated ${updated}/${incidents.length} incidents (${noDate} had no date available)`
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
