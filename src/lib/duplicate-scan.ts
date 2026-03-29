/**
 * Scans a newly completed incident against existing approved incidents
 * to detect potential duplicates. If a strong match is found, sets
 * `duplicateOfId` on the new incident so the admin UI can prompt for merge.
 */

import { prisma } from "@/lib/db";
import { extractPersonName, nameMatchScore } from "@/lib/name-utils";

const STOP_NAMES = new Set([
  "United States", "Border Patrol", "White House", "Supreme Court",
  "Federal Court", "Immigration Judge", "Central Louisiana",
  "South Burlington", "Salt Lake", "San Antonio", "Los Angeles",
  "New York", "North Carolina", "South Carolina", "San Diego",
  "San Francisco", "El Salvador", "Costa Rica", "Puerto Rico",
  "Dominican Republic", "Federal Plaza", "District Court",
  "Customs Enforcement", "Homeland Security", "National Guard",
]);

function extractAllPersonNames(text: string): string[] {
  if (!text) return [];
  const namePattern =
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})\b/g;
  const names: string[] = [];
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    if (!STOP_NAMES.has(name) && name.length > 5) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

const STOPWORDS = new Set([
  "after", "with", "from", "that", "this", "their", "about", "been",
  "have", "were", "they", "will", "would", "could", "should", "during",
  "before", "while", "under", "between", "through", "against", "without",
  "within", "also", "than", "more", "said", "says", "according", "told",
  "over", "into", "being", "which", "when", "where", "some", "other",
  "year", "years", "people", "including", "since", "states", "united",
  "federal", "immigration", "detained", "detention", "agents", "enforcement",
]);

function getKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-záéíóúñü]/g, ""))
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

/**
 * Score how likely two incidents are about the same person/event.
 * Returns 0–1. Uses name matching (primary) with keyword overlap fallback.
 */
export function scoreIncidentMatch(
  source: { headline: string | null; summary: string | null; location: string | null },
  existing: { headline: string | null; summary: string | null; location: string | null }
): number {
  if (!source.headline || !existing.headline) return 0;

  let score = 0;

  // Extract names from both headline and summary
  const srcHeadlineName = extractPersonName(source.headline);
  const srcSummaryNames = extractAllPersonNames(source.summary ?? "");
  const allSourceNames = [srcHeadlineName, ...srcSummaryNames].filter(Boolean) as string[];

  const existHeadlineName = extractPersonName(existing.headline);
  const existSummaryNames = extractAllPersonNames(existing.summary ?? "");
  const allExistingNames = [existHeadlineName, ...existSummaryNames].filter(Boolean) as string[];

  // Name-based matching
  for (const srcName of allSourceNames) {
    for (const existName of allExistingNames) {
      const s = nameMatchScore(srcName, existName);
      if (s > score) score = s;
    }
  }

  // Substring name matching
  if (score < 0.5) {
    const existingFullText = (existing.headline + " " + (existing.summary ?? "")).toLowerCase();
    for (const srcName of allSourceNames) {
      const nameLower = srcName.toLowerCase();
      if (existingFullText.includes(nameLower)) {
        score = Math.max(score, 0.9);
      } else {
        const parts = nameLower.split(/\s+/);
        if (parts.length >= 2) {
          const firstName = parts[0];
          const surnames = parts.slice(1);
          const firstMatch = existingFullText.includes(firstName);
          const surnameMatch = surnames.some((s) => s.length > 3 && existingFullText.includes(s));
          if (firstMatch && surnameMatch) {
            score = Math.max(score, 0.75);
          }
        }
      }
    }
  }

  // Keyword overlap fallback — cap at 0.55 so keyword-only matches
  // stay below the 0.6 auto-flag threshold and require AI verification.
  // In this domain most incidents share ICE/immigration vocabulary,
  // so keyword overlap alone is not reliable enough to flag duplicates.
  if (score < 0.5) {
    const words1 = getKeywords(source.headline + " " + (source.summary ?? ""));
    const words2 = getKeywords(existing.headline + " " + (existing.summary ?? ""));
    const overlap = [...words1].filter((w) => words2.has(w)).length;
    const minWords = Math.min(words1.size, words2.size);
    if (minWords > 0) {
      const wordScore = overlap / minWords;
      const loc1 = source.location?.toLowerCase().trim() ?? "";
      const loc2 = existing.location?.toLowerCase().trim() ?? "";
      const locMatch = loc1 && loc2 && (loc1.includes(loc2) || loc2.includes(loc1) || loc1 === loc2);
      const locationBoost = locMatch ? 0.15 : 0;
      const keywordScore = Math.min(wordScore * 0.8 + locationBoost, 0.55);
      score = Math.max(score, keywordScore);
    }
  }

  return score;
}

/**
 * Use Claude to verify whether two incidents describe the same event/person.
 */
async function verifyDuplicateWithAI(
  source: { headline: string; summary: string | null },
  existing: { headline: string; summary: string | null },
  anthropicKey: string
): Promise<boolean> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const prompt = `You are checking whether two incident records describe the SAME specific event or the SAME individual.

Record A:
Headline: ${source.headline}
Summary: ${source.summary ?? "(none)"}

Record B:
Headline: ${existing.headline}
Summary: ${existing.summary ?? "(none)"}

Do these two records describe the SAME specific incident — the same individual(s) AND the same event?
Answer YES only if they clearly cover the exact same story (e.g. same person detained, same protest, same raid).
Answer NO if they are about different people, different events, or only share a general topic.
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
    console.warn("[duplicate-scan] AI verification failed:", err.message);
    return false;
  }
}

/**
 * After an incident completes processing, scan approved incidents for a match.
 * Uses scoring to find candidates, then verifies top candidates with Claude.
 */
export async function scanForDuplicate(incidentId: number): Promise<void> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { headline: true, summary: true, location: true },
  });

  if (!incident?.headline) return;

  const existing = await prisma.incident.findMany({
    where: {
      status: "COMPLETE",
      approved: true,
      headline: { not: null },
      id: { not: incidentId },
    },
    select: { id: true, headline: true, summary: true, location: true },
    orderBy: { parsedDate: "desc" },
    take: 1000,
  });

  // Score all existing incidents to find candidates
  const scored: Array<{ id: number; score: number; headline: string; summary: string | null }> = [];
  for (const e of existing) {
    const score = scoreIncidentMatch(incident, e);
    if (score >= 0.35) {
      scored.push({ id: e.id, score, headline: e.headline!, summary: e.summary });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) return;

  // Always verify with AI — heuristic scoring alone produces too many
  // false positives in this domain where all incidents share ICE vocabulary.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return;

  const topCandidates = scored.slice(0, 3);
  for (const candidate of topCandidates) {
    const confirmed = await verifyDuplicateWithAI(
      { headline: incident.headline, summary: incident.summary },
      { headline: candidate.headline, summary: candidate.summary },
      anthropicKey
    );
    if (confirmed) {
      await prisma.incident.update({
        where: { id: incidentId },
        data: { duplicateOfId: candidate.id },
      });
      console.log(
        `[duplicate-scan] #${incidentId} AI-confirmed match #${candidate.id} (score: ${candidate.score.toFixed(2)})`
      );
      return;
    }
  }
}
