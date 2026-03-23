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

async function main() {
  const missing = await prisma.incident.findMany({
    where: {
      headline: { not: null },
      OR: [{ date: null }, { date: "" }],
    },
    select: { id: true, headline: true, summary: true, createdAt: true },
    orderBy: { id: "desc" },
  });

  console.log(`Incidents missing date: ${missing.length}\n`);

  let filled = 0;
  for (let i = 0; i < missing.length; i++) {
    const inc = missing[i];
    if (!inc.summary) {
      // No summary to extract from — use createdAt
      const d = inc.createdAt;
      const formatted = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      await prisma.incident.update({
        where: { id: inc.id },
        data: { date: formatted, parsedDate: d },
      });
      filled++;
      continue;
    }

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Extract the most specific date of the main event from this text. Return ONLY the date in M/D/YYYY format. If no date can be determined, return NONE.\n\nHeadline: ${inc.headline}\nSummary: ${inc.summary.substring(0, 400)}`,
          },
        ],
      });

      const answer =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "NONE";

      if (answer !== "NONE" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(answer)) {
        const parsed = new Date(answer);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          await prisma.incident.update({
            where: { id: inc.id },
            data: { date: answer, parsedDate: parsed },
          });
          filled++;
          console.log(`[${inc.id}] ${answer} | ${inc.headline?.substring(0, 60)}`);
        }
      } else {
        // Fallback to createdAt
        const d = inc.createdAt;
        const formatted = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
        await prisma.incident.update({
          where: { id: inc.id },
          data: { date: formatted, parsedDate: d },
        });
        filled++;
      }
    } catch (e: any) {
      if (e.message?.includes("429")) {
        await sleep(5000);
        i--;
        continue;
      }
    }
    if (i % 5 === 4) await sleep(1200);
  }

  console.log(`\nFilled dates for ${filled}/${missing.length} incidents`);
  await prisma.$disconnect();
}

main().catch(console.error);
