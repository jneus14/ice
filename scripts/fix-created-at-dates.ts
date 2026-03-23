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
  // Find incidents where parsedDate is within 2 days of createdAt
  // (meaning the date was set from createdAt as a fallback, not from the article)
  const all = await prisma.incident.findMany({
    where: {
      headline: { not: null },
      status: "COMPLETE",
      summary: { not: null },
    },
    select: {
      id: true,
      headline: true,
      summary: true,
      date: true,
      parsedDate: true,
      createdAt: true,
    },
    orderBy: { id: "desc" },
  });

  const suspects = all.filter((inc) => {
    if (!inc.parsedDate) return false;
    const diff = Math.abs(
      inc.parsedDate.getTime() - inc.createdAt.getTime()
    );
    return diff < 2 * 86400000; // within 2 days of createdAt
  });

  console.log(
    `Found ${suspects.length} incidents where date may be from createdAt\n`
  );

  let fixed = 0;
  for (let i = 0; i < suspects.length; i++) {
    const inc = suspects[i];

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Extract the date when this incident OCCURRED (not when the article was published). Return ONLY the date in M/D/YYYY format. If no specific date can be determined from the text, return NONE.

Headline: ${inc.headline}
Summary: ${(inc.summary ?? "").substring(0, 500)}`,
          },
        ],
      });

      const answer =
        msg.content[0].type === "text" ? msg.content[0].text.trim() : "NONE";

      if (answer !== "NONE" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(answer)) {
        const parsed = new Date(answer);
        if (
          !isNaN(parsed.getTime()) &&
          parsed <= new Date() &&
          parsed.getFullYear() >= 2024
        ) {
          // Only update if it's different from current date
          const currentDate = inc.date ?? "";
          if (answer !== currentDate) {
            await prisma.incident.update({
              where: { id: inc.id },
              data: { date: answer, parsedDate: parsed },
            });
            fixed++;
            console.log(
              `[${inc.id}] ${inc.date} -> ${answer} | ${inc.headline?.substring(0, 55)}`
            );
          }
        }
      }
    } catch (e: any) {
      if (e.message?.includes("429")) {
        await sleep(5000);
        i--;
        continue;
      }
    }
    if (i % 5 === 4) await sleep(1200);
    if (i % 100 === 99)
      console.log(`\nProgress: ${i + 1}/${suspects.length} (${fixed} fixed)\n`);
  }

  console.log(`\nFixed dates for ${fixed}/${suspects.length} incidents`);
  await prisma.$disconnect();
}

main().catch(console.error);
