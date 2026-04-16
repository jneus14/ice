/**
 * Re-verify altSources on Instagram-sourced incidents.
 * Fetches each article via Exa, checks relevance with Claude,
 * and removes sources that don't match the specific incident.
 */

import { PrismaClient } from "@prisma/client";
import Exa from "exa-js";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();

const BATCH_DELAY_MS = 300;

async function verifyArticleRelevance(
  refHeadline: string,
  refSummary: string,
  article: { url: string; title?: string | null; text?: string | null },
  anthropic: Anthropic
): Promise<boolean> {
  if (!article.text || article.text.length < 100) return false;
  try {
    const prompt = `You are verifying whether a news article covers the same specific incident as a reference story.

Reference incident:
Headline: ${refHeadline}
Summary: ${refSummary}

Candidate article (${article.url}):
Title: ${article.title ?? "(no title)"}
Text excerpt: ${article.text.slice(0, 2500)}

Does this candidate article describe the SAME SPECIFIC INCIDENT — the same individual(s) and the same event?
Answer YES only if the article clearly covers this exact incident.
Answer NO if it is a different person, a different event, or only tangentially related (e.g. same topic but different case).
Answer with only YES or NO.`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [{ role: "user", content: prompt }],
    });
    const answer =
      msg.content[0]?.type === "text"
        ? msg.content[0].text.trim().toUpperCase()
        : "NO";
    return answer.startsWith("YES");
  } catch (err: any) {
    console.warn(`  ⚠ relevance check failed: ${err.message?.slice(0, 80)}`);
    return false;
  }
}

async function main() {
  const exaKey = process.env.EXA_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!exaKey) throw new Error("EXA_API_KEY required");
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY required");

  const exa = new Exa(exaKey);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Find all complete Instagram posts with altSources
  const incidents = await prisma.incident.findMany({
    where: {
      url: { contains: "instagram.com" },
      status: "COMPLETE",
      headline: { not: null },
      altSources: { not: null },
      NOT: [{ altSources: "[]" }, { altSources: "" }],
    },
    select: { id: true, headline: true, summary: true, altSources: true },
    orderBy: { id: "desc" },
  });

  console.log(`Found ${incidents.length} Instagram incidents with sources to re-verify.\n`);

  let totalRemoved = 0;
  let totalKept = 0;
  let incidentsModified = 0;

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    const urls: string[] = JSON.parse(inc.altSources!);
    if (urls.length === 0) continue;

    console.log(`[${i + 1}/${incidents.length}] #${inc.id}: "${inc.headline}" — ${urls.length} source(s)`);

    const kept: string[] = [];
    const removed: string[] = [];

    // Batch-fetch all article texts for this incident
    let articlesById: Map<string, { title?: string; text?: string }> = new Map();
    try {
      const contents = await (exa as any).getContents(urls, {
        text: { maxCharacters: 3000 },
      });
      for (const r of contents.results ?? []) {
        articlesById.set(r.url, { title: r.title, text: r.text });
      }
    } catch (err: any) {
      console.log(`  ⚠ Could not fetch contents: ${err.message?.slice(0, 80)}`);
      console.log(`  → Keeping all sources for this incident\n`);
      totalKept += urls.length;
      continue;
    }

    for (const url of urls) {
      try {
        const article = articlesById.get(url);

        if (!article?.text || article.text.length < 100) {
          // Can't verify without text — keep it (benefit of the doubt)
          kept.push(url);
          console.log(`  ? ${url} (no text available, keeping)`);
          continue;
        }

        const ok = await verifyArticleRelevance(
          inc.headline!,
          inc.summary ?? "",
          { url, title: article.title ?? null, text: article.text },
          anthropic
        );

        if (ok) {
          kept.push(url);
          console.log(`  ✓ ${url}`);
        } else {
          removed.push(url);
          console.log(`  ✗ ${url}`);
        }
      } catch (err: any) {
        // On error, keep the source
        kept.push(url);
        console.log(`  ? ${url} (error: ${err.message?.slice(0, 60)}, keeping)`);
      }

      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    if (removed.length > 0) {
      await prisma.incident.update({
        where: { id: inc.id },
        data: { altSources: JSON.stringify(kept) },
      });
      incidentsModified++;
      console.log(`  → Removed ${removed.length}, kept ${kept.length}\n`);
    } else {
      console.log(`  → All ${kept.length} sources verified\n`);
    }

    totalRemoved += removed.length;
    totalKept += kept.length;
  }

  console.log(`\nDone!`);
  console.log(`  Incidents checked: ${incidents.length}`);
  console.log(`  Incidents modified: ${incidentsModified}`);
  console.log(`  Sources kept: ${totalKept}`);
  console.log(`  Sources removed: ${totalRemoved}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
