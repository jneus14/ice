import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import Exa from "exa-js";
import { verifyArticleRelevance } from "@/lib/instagram-pipeline";

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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return new Response(JSON.stringify({ error: "EXA_API_KEY not configured" }), {
      status: 500,
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
            status: "COMPLETE",
            OR: [{ altSources: null }, { altSources: "[]" }, { altSources: "" }],
          },
          select: { id: true, headline: true, summary: true, url: true },
          orderBy: { id: "desc" },
        });

        send(`Found ${incidents.length} incidents without alt sources`);

        const exa = new Exa(exaKey);
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        let updated = 0;
        let totalSources = 0;

        for (let i = 0; i < incidents.length; i++) {
          const inc = incidents[i];
          try {
            const searchQuery = [inc.headline, inc.summary].filter(Boolean).join(". ");
            const results = await exa.search(searchQuery, {
              numResults: 5,
              type: "neural",
              excludeDomains: SOCIAL_DOMAINS,
              contents: { text: { maxCharacters: 3000 } },
            });

            const candidates = (results.results || [])
              .filter(
                (r: any) =>
                  r.url &&
                  r.url !== inc.url &&
                  !SOCIAL_DOMAINS.some((d) => r.url.includes(d))
              );

            // Verify relevance with Claude if possible
            let newsUrls: string[];
            if (anthropicKey) {
              const verified: string[] = [];
              for (const r of candidates) {
                const ok = await verifyArticleRelevance(
                  inc.headline!,
                  inc.summary ?? "",
                  { url: r.url, title: r.title ?? null, text: (r as any).text ?? null },
                  anthropicKey
                );
                if (ok) verified.push(r.url);
              }
              newsUrls = verified;
            } else {
              newsUrls = candidates.map((r: any) => r.url);
            }

            if (newsUrls.length > 0) {
              await prisma.incident.update({
                where: { id: inc.id },
                data: { altSources: JSON.stringify(newsUrls) },
              });
              updated++;
              totalSources += newsUrls.length;
              send(`[${i + 1}/${incidents.length}] #${inc.id}: +${newsUrls.length} sources`);
            } else {
              send(`[${i + 1}/${incidents.length}] #${inc.id}: no sources found`);
            }
          } catch (e: any) {
            if (e.message?.includes("429") || e.message?.includes("rate")) {
              send(`Rate limited, waiting 3s...`);
              await sleep(3000);
              i--;
              continue;
            }
            send(`[${i + 1}/${incidents.length}] #${inc.id} ERROR: ${e.message?.substring(0, 80)}`);
          }

          await sleep(300);
        }

        send(`\nDone! Updated ${updated}/${incidents.length} incidents with ${totalSources} total sources.`);
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
