import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";
import Exa from "exa-js";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const exa = new Exa(process.env.EXA_API_KEY!);
const anthropic = new Anthropic();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const PROMPT = `Given this news article about an immigration enforcement incident, write a 2-4 sentence factual summary. Be strictly factual. Do not editorialize or use phrases like "highlights," "raises questions," "became a symbol," or "drew attention." Just state what happened, to whom, where, and the outcome.

Return ONLY the summary text, no quotes or labels.`;

async function main() {
  const posts = await prisma.incident.findMany({
    where: {
      url: { contains: "instagram.com" },
      headline: { not: null },
      status: "COMPLETE",
      altSources: { not: null },
    },
    select: { id: true, headline: true, summary: true, altSources: true },
    orderBy: { id: "desc" },
  });

  const needsUpdate = posts.filter((p) => {
    if (!p.summary) return true;
    if (p.summary.length < 150) return true;
    return false;
  });

  console.log("Total Instagram posts:", posts.length);
  console.log("With short/missing summaries:", needsUpdate.length);

  let updated = 0;

  for (let i = 0; i < needsUpdate.length; i++) {
    const inc = needsUpdate[i];
    let urls: string[] = [];
    try {
      urls = JSON.parse(inc.altSources!);
    } catch {
      continue;
    }
    if (!Array.isArray(urls) || urls.length === 0) continue;

    const newsUrl = urls[0];
    try {
      const contents = await exa.getContents([newsUrl], {
        text: { maxCharacters: 3000 },
      });
      const article = contents.results?.[0];
      if (!article?.text || article.text.length < 100) continue;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `${PROMPT}\n\nHeadline: ${inc.headline}\nArticle text: ${article.text.substring(0, 2500)}`,
          },
        ],
      });

      const newSummary =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      if (newSummary.length > 80) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { summary: newSummary },
        });
        updated++;
        console.log(
          `[${inc.id}] Updated (${inc.summary?.length ?? 0} -> ${newSummary.length}) | ${inc.headline?.substring(0, 55)}`
        );
      }
    } catch (e: any) {
      if (e.message?.includes("429")) {
        console.log("Rate limited, waiting 5s...");
        await sleep(5000);
        i--;
      } else {
        console.error(`[${inc.id}] Error: ${e.message?.substring(0, 80)}`);
      }
    }
    if (i % 3 === 2) await sleep(1500);
  }

  console.log(`\nUpdated ${updated}/${needsUpdate.length} short summaries`);
  await prisma.$disconnect();
}

main().catch(console.error);
