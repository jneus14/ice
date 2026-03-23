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

const PROMPT = `Which stories involve ACTUAL climate or environmental factors? Tag stories about:
- Death or injury from heat exposure, hypothermia, dehydration, drowning during border crossing
- Desert deaths, river drownings, exposure to extreme weather
- Environmental damage from border wall construction (habitat destruction, aquifer damage)
- Detention facility conditions specifically related to extreme heat or cold exposure
- Deaths during deportation flights from medical or environmental causes
- Migrants found dead from environmental exposure

Do NOT tag stories that merely use phrases like "climate of fear" or "political climate" — those are metaphorical, not environmental.
Do NOT tag general detention conditions unless specifically about heat or cold exposure.
Do NOT tag stories about medical neglect unless the medical issue is caused by environmental conditions (heat stroke, hypothermia, dehydration from desert crossing).

Answer with ONLY the numbers that qualify, comma-separated. If none, answer NONE.`;

async function main() {
  const incidents = await prisma.incident.findMany({
    where: {
      headline: { not: null },
      status: "COMPLETE",
      NOT: { incidentType: { contains: "Climate" } },
    },
    select: { id: true, headline: true, summary: true, incidentType: true },
    orderBy: { id: "desc" },
  });
  console.log(`Checking ${incidents.length} incidents for Climate/Environmental tag...\n`);

  const BATCH = 25;
  let added = 0;

  for (let i = 0; i < incidents.length; i += BATCH) {
    const batch = incidents.slice(i, i + BATCH);
    const batchText = batch
      .map(
        (inc, idx) =>
          `${idx + 1}. ${inc.headline}\n   ${(inc.summary || "").substring(0, 150)}`
      )
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
              const tags = inc.incidentType
                ? inc.incidentType + ", Climate/Environmental"
                : "Climate/Environmental";
              await prisma.incident.update({
                where: { id: inc.id },
                data: { incidentType: tags },
              });
              added++;
              console.log(
                `  [${inc.id}] +Climate: ${inc.headline?.substring(0, 65)}`
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
    }
    if (i % 200 === 0 && i > 0)
      console.log(
        `\nProgress: ${i}/${incidents.length} (${added} added)\n`
      );
    await sleep(1200);
  }

  console.log(`\nAdded Climate/Environmental to ${added} incidents`);
  await prisma.$disconnect();
}

main().catch(console.error);
