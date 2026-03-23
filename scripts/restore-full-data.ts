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

const EXTRACT_PROMPT = `Extract structured data from this article. Return ONLY valid JSON with no markdown:
{"headline":"Short headline max 15 words","date":"M/D/YYYY or null","location":"City, State or null","summary":"2-4 sentence factual summary","incidentType":"Comma-separated tags from: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Minor/Family, U.S. Citizen, Raid, Resistance, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Process Issue, Climate/Environmental, Vigilante","country":"Country of origin or null"}`;

async function main() {
  const restored = await prisma.incident.findMany({
    where: { url: { startsWith: "restored-" } },
    select: { id: true, headline: true },
  });
  console.log(`Restored posts to fix: ${restored.length}\n`);

  let fixed = 0;
  for (let i = 0; i < restored.length; i++) {
    const inc = restored[i];
    console.log(`\n[${inc.id}] ${inc.headline}`);

    try {
      const results = await exa.search(inc.headline!, {
        numResults: 3,
        type: "keyword",
        excludeDomains: [
          "instagram.com",
          "twitter.com",
          "facebook.com",
          "tiktok.com",
          "reddit.com",
        ],
      });

      const articles = (results.results ?? []).filter(
        (r) => r.url
      );
      if (articles.length === 0) {
        console.log("  No articles found");
        continue;
      }

      const best = articles[0];
      const altUrls = articles.slice(1).map((a) => a.url);

      // Fetch content for extraction
      let articleText = "";
      try {
        const contents = await exa.getContents([best.url], {
          text: { maxCharacters: 2000 },
        });
        articleText = contents.results?.[0]?.text ?? "";
      } catch {}

      if (!articleText && best.title) {
        articleText = best.title;
      }

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `${EXTRACT_PROMPT}\n\nTitle: ${best.title ?? ""}\nPublished: ${best.publishedDate ?? ""}\nText: ${articleText.substring(0, 2000)}`,
          },
        ],
      });

      const text =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
      let jsonStr = text;
      if (jsonStr.startsWith("```"))
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

      const data = JSON.parse(jsonStr);

      let parsedDate: Date | null = null;
      if (data.date && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(data.date)) {
        parsedDate = new Date(data.date);
        if (isNaN(parsedDate.getTime())) parsedDate = null;
      }
      if (!parsedDate && best.publishedDate) {
        parsedDate = new Date(best.publishedDate);
        if (isNaN(parsedDate.getTime())) parsedDate = null;
        if (parsedDate) {
          data.date = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
        }
      }

      await prisma.incident.update({
        where: { id: inc.id },
        data: {
          url: best.url,
          headline: data.headline || inc.headline,
          summary: data.summary || null,
          date: data.date || null,
          parsedDate,
          location: data.location || null,
          incidentType: data.incidentType || null,
          country: data.country || null,
          altSources: altUrls.length > 0 ? JSON.stringify(altUrls) : null,
          status: "COMPLETE",
          approved: false,
        },
      });
      fixed++;
      console.log(`  -> ${best.url}`);
      console.log(
        `  -> ${data.date} | ${data.location} | ${(data.summary ?? "").substring(0, 60)}`
      );
    } catch (e: any) {
      if (e.message?.includes("429")) {
        await sleep(5000);
        i--;
        continue;
      }
      if (e.message?.includes("exceeded your credits")) {
        console.log("  Exa credits exhausted");
        break;
      }
      console.error(`  Error: ${e.message?.substring(0, 80)}`);
    }
    await sleep(1500);
  }

  console.log(`\nFixed ${fixed}/${restored.length} restored incidents`);
  await prisma.$disconnect();
}

main().catch(console.error);
