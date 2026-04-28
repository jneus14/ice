/**
 * Backfill the "Black" person-impacted tag on existing incidents.
 * Matches:
 *   - country of origin in Africa
 *   - "Afro-" in summary or headline
 *   - "African American" / "African-American" in summary or headline
 *   - "Black <person-noun>" (e.g. "Black man", "Black asylum seeker") in summary or headline
 *
 * Usage:
 *   pnpm tsx scripts/backfill-black-tag.ts --dry   (preview)
 *   pnpm tsx scripts/backfill-black-tag.ts         (apply)
 */
import { prisma } from "../src/lib/db";
import { AFRICAN_COUNTRIES } from "../src/lib/constants";

const AFRO_RE = /\bAfro-/i;
const AFRICAN_AMERICAN_RE = /\bAfrican[\s-]Americans?\b/i;
const BLACK_PERSON_RE =
  /\bBlack\s+(man|woman|men|women|person|people|child|children|teen|teens|youth|youths|family|families|community|communit(y|ies)|American|Americans|immigrant|immigrants|migrant|migrants|asylum|refugee|refugees|student|students|resident|residents|national|nationals|girl|boy|girls|boys|mother|father|parent|parents|brother|sister|son|daughter)\b/i;

function isMatch({
  country,
  headline,
  summary,
}: {
  country: string | null;
  headline: string | null;
  summary: string | null;
}): { match: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = [headline, summary].filter(Boolean).join(" ");
  if (country && AFRICAN_COUNTRIES.has(country.trim().toLowerCase())) {
    reasons.push(`country=${country}`);
  }
  if (AFRO_RE.test(text)) reasons.push("afro-");
  if (AFRICAN_AMERICAN_RE.test(text)) reasons.push("african american");
  if (BLACK_PERSON_RE.test(text)) reasons.push("Black <person>");
  return { match: reasons.length > 0, reasons };
}

async function main() {
  const dry = process.argv.includes("--dry");

  const all = await prisma.incident.findMany({
    select: {
      id: true,
      country: true,
      headline: true,
      summary: true,
      incidentType: true,
    },
  });

  const matches: Array<{ id: number; reasons: string[]; current: string | null }> = [];
  for (const row of all) {
    const tags = (row.incidentType ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.includes("Black")) continue;
    const { match, reasons } = isMatch(row);
    if (match) matches.push({ id: row.id, reasons, current: row.incidentType });
  }

  console.log(`Total rows: ${all.length}`);
  console.log(`New Black-tag matches: ${matches.length}`);
  if (matches.length > 0) {
    console.log("\nFirst 10 matches:");
    for (const m of matches.slice(0, 10)) {
      console.log(`  ${m.id} [${m.reasons.join(", ")}] tags: ${m.current ?? "(none)"}`);
    }
  }

  if (dry) {
    console.log("\nDry run — no changes applied.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const m of matches) {
    const tags = (m.current ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    tags.push("Black");
    const next = tags.join(", ");
    await prisma.incident.update({
      where: { id: m.id },
      data: { incidentType: next },
    });
    updated++;
  }
  console.log(`\nApplied: ${updated} rows updated.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
