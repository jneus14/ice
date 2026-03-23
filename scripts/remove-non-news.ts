import { config } from "dotenv";
import { resolve } from "path";
const r = config({ path: resolve(__dirname, "../.env.local") });
if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) process.env[k] = v;

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const anthropic = new Anthropic();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const PROMPT = `Which of these are NOT news stories about specific immigration enforcement incidents? Flag items that are:
- Legal advice or guides (e.g. "what to do if stopped", "know your rights", "how to find someone in detention")
- General explainers or listicles not about a specific incident
- Data reports or statistics roundups without a specific incident
- Resource pages, maps, databases, or tools
- Academic papers or research methodology
- Opinion/editorial pieces without a specific incident

Do NOT flag actual news stories about specific people, events, raids, detentions, deaths, protests, court rulings, or policy changes. Those belong in the tracker.

Answer with ONLY the numbers of non-news items, comma-separated. If all are news, answer NONE.`;

async function main() {
  const all = await prisma.incident.findMany({
    where: { headline: { not: null }, status: "COMPLETE", approved: true },
    select: { id: true, headline: true },
    orderBy: { id: "desc" },
  });
  console.log(`Checking ${all.length} incidents for non-news content...\n`);

  const BATCH = 25;
  let removed = 0;

  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const batchText = batch
      .map((inc, idx) => `${idx + 1}. [${inc.id}] ${inc.headline}`)
      .join("\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `${PROMPT}\n\n${batchText}`,
          },
        ],
      });

      const answer =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "NONE";
      if (answer !== "NONE" && answer !== "") {
        const nums = answer.match(/\d+/g);
        if (nums) {
          for (const numStr of nums) {
            const idx = parseInt(numStr) - 1;
            if (idx >= 0 && idx < batch.length) {
              const inc = batch[idx];
              await prisma.incident.update({
                where: { id: inc.id },
                data: { approved: false },
              });
              removed++;
              console.log(
                `  [${inc.id}] Removed: ${inc.headline?.substring(0, 70)}`
              );
            }
          }
        }
      }
    } catch (e: any) {
      if (e.message?.includes("429")) {
        await sleep(5000);
        i -= BATCH;
        continue;
      }
      console.error(`Error: ${e.message?.substring(0, 80)}`);
    }
    if (i % 200 === 0 && i > 0)
      console.log(`\nProgress: ${i}/${all.length} (${removed} removed)\n`);
    await sleep(1200);
  }

  console.log(`\nUnapproved ${removed} non-news items`);
  await prisma.$disconnect();
}

main().catch(console.error);
