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

const PROMPT = `Rewrite this text to remove the word "illegal" when used to describe people or border crossings. Rules:
- "illegal immigrant/alien/migrant" → "immigrant" or "undocumented immigrant"
- "illegally entered/crossed" or "illegal border crossing" → "crossed the border" or "unauthorized entry"
- "illegal entry" → "unauthorized entry"
- "Man illegally in the U.S." → "Man in the U.S. without authorization"
- Keep "illegal" when it describes the government's actions (e.g. "illegally detained", "illegal arrests", "ruled illegal") — those are fine
- Keep "illegal" when describing non-immigration crimes (e.g. "illegal gambling")
- Make minimal changes — only fix the word "illegal" when it describes people or their movement

If no changes are needed, return the original text unchanged.
Return ONLY the rewritten text, no quotes or labels.`;

async function main() {
  // Fix headlines
  const headlineIncidents = await prisma.incident.findMany({
    where: { headline: { contains: "illegal", mode: "insensitive" } },
    select: { id: true, headline: true },
  });

  console.log(`Fixing ${headlineIncidents.length} headlines...\n`);
  let hFixed = 0;

  for (let i = 0; i < headlineIncidents.length; i++) {
    const inc = headlineIncidents[i];
    const h = inc.headline!;

    // Quick check: does it use "illegal" to describe people/crossing?
    const lc = h.toLowerCase();
    const describesPeople =
      lc.includes("illegal immigrant") ||
      lc.includes("illegal alien") ||
      lc.includes("illegal border") ||
      lc.includes("illegal entry") ||
      lc.includes("illegal crossing") ||
      lc.includes("illegal status") ||
      lc.includes("illegally in") ||
      lc.includes("illegally cross") ||
      lc.includes("illegally enter");

    if (!describesPeople) continue;

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: `${PROMPT}\n\n${h}` }],
      });
      const newH = msg.content[0].type === "text" ? msg.content[0].text.trim() : h;
      if (newH !== h && newH.length > 10) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { headline: newH },
        });
        hFixed++;
        console.log(`[${inc.id}] "${h}"\n  → "${newH}"\n`);
      }
    } catch (e: any) {
      if (e.message?.includes("429")) { await sleep(5000); i--; continue; }
    }
    await sleep(1200);
  }

  // Fix summaries
  const summaryIncidents = await prisma.incident.findMany({
    where: { summary: { contains: "illegal", mode: "insensitive" } },
    select: { id: true, headline: true, summary: true },
  });

  console.log(`\nFixing ${summaryIncidents.length} summaries...\n`);
  let sFixed = 0;

  for (let i = 0; i < summaryIncidents.length; i++) {
    const inc = summaryIncidents[i];
    const s = inc.summary!;

    const lc = s.toLowerCase();
    const describesPeople =
      lc.includes("illegal immigrant") ||
      lc.includes("illegal alien") ||
      lc.includes("illegally in the") ||
      lc.includes("illegally cross") ||
      lc.includes("illegally enter") ||
      lc.includes("illegal entry") ||
      lc.includes("illegal border") ||
      lc.includes("illegal crossing") ||
      lc.includes("illegally residing") ||
      lc.includes("illegal status") ||
      lc.includes("illegal migrant") ||
      lc.includes("man illegally") ||
      lc.includes("woman illegally") ||
      lc.includes("person illegally") ||
      lc.includes("people illegally");

    if (!describesPeople) continue;

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: `${PROMPT}\n\n${s}` }],
      });
      const newS = msg.content[0].type === "text" ? msg.content[0].text.trim() : s;
      if (newS !== s && newS.length > 30) {
        await prisma.incident.update({
          where: { id: inc.id },
          data: { summary: newS },
        });
        sFixed++;
        console.log(`[${inc.id}] ${inc.headline?.substring(0, 50)}`);
        console.log(`  Fixed summary\n`);
      }
    } catch (e: any) {
      if (e.message?.includes("429")) { await sleep(5000); i--; continue; }
    }
    await sleep(1200);
  }

  console.log(`\nFixed ${hFixed} headlines and ${sFixed} summaries`);
  await prisma.$disconnect();
}

main().catch(console.error);
