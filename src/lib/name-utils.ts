/**
 * Name normalization and matching utilities for Latin American naming conventions.
 *
 * Latin American names often use 2–4 parts:
 *   [first] [middle?] [paternal surname] [maternal surname?]
 *
 * The same person may appear as:
 *   "Dylan Lopez Contreras" vs "Dylan Contreras"
 *   "Estefany Maria Rodriguez Florez" vs "Estefany Rodriguez"
 */

export type NameParts = {
  first: string;
  middle: string | null;
  surnames: string[]; // all surname parts (paternal + maternal)
};

/**
 * Strip diacritics and lowercase a name for comparison.
 * "Rodríguez" → "rodriguez"
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Extract structured name parts from a full name string.
 * Handles 2-part, 3-part, and 4-part Latin American name conventions.
 */
export function extractNameParts(name: string): NameParts {
  const parts = normalizeName(name)
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return { first: "", middle: null, surnames: [] };
  }

  if (parts.length === 1) {
    return { first: parts[0], middle: null, surnames: [] };
  }

  if (parts.length === 2) {
    // first + surname
    return { first: parts[0], middle: null, surnames: [parts[1]] };
  }

  if (parts.length === 3) {
    // Ambiguous: could be first+paternal+maternal OR first+middle+paternal
    // Store all non-first parts as surnames for flexible matching
    return { first: parts[0], middle: null, surnames: [parts[1], parts[2]] };
  }

  // 4+ parts: first + middle + paternal + maternal (+ any extras as additional surnames)
  return {
    first: parts[0],
    middle: parts[1],
    surnames: parts.slice(2),
  };
}

/**
 * Compute a match score (0–1) between two name strings, considering Latin American
 * naming conventions where people may go by different subsets of their full name.
 *
 * Returns 0 if first names don't match.
 * Returns 0.9+ if first name matches AND at least one surname overlaps.
 * Returns 0.5 if only first names match (no surname info to compare).
 */
export function nameMatchScore(a: string, b: string): number {
  const partsA = extractNameParts(a);
  const partsB = extractNameParts(b);

  if (!partsA.first || !partsB.first) return 0;

  // First names must match
  if (partsA.first !== partsB.first) return 0;

  // Collect all non-first-name parts for each (middle + surnames)
  const allPartsA = [
    ...(partsA.middle ? [partsA.middle] : []),
    ...partsA.surnames,
  ];
  const allPartsB = [
    ...(partsB.middle ? [partsB.middle] : []),
    ...partsB.surnames,
  ];

  // If either has no surname info, we can only match on first name
  if (allPartsA.length === 0 || allPartsB.length === 0) return 0.5;

  // Check for any surname overlap
  const setA = new Set(allPartsA);
  const overlap = allPartsB.filter((p) => setA.has(p));

  if (overlap.length === 0) return 0.3; // first name matches but no surname overlap

  // Score based on how many parts overlap
  const maxParts = Math.max(allPartsA.length, allPartsB.length);
  const overlapRatio = overlap.length / maxParts;

  // Base score of 0.85 for any surname match, up to 1.0 for full match
  return 0.85 + overlapRatio * 0.15;
}

// Common words that appear in headlines but aren't person names
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "by",
  "from",
  "with",
  "is",
  "was",
  "are",
  "were",
  "has",
  "had",
  "have",
  "been",
  "be",
  "will",
  "after",
  "before",
  "during",
  "while",
  "about",
  "over",
  "under",
  "between",
  "into",
  "through",
  "up",
  "out",
  "off",
  "who",
  "ice",
  "dhs",
  "cbp",
  "nyc",
  "u.s.",
  "us",
  "new",
  "city",
]);

// Action words that typically follow a person's name in headlines
const ACTION_WORDS = new Set([
  "detained",
  "deported",
  "arrested",
  "released",
  "dies",
  "died",
  "killed",
  "held",
  "faces",
  "facing",
  "fights",
  "fighting",
  "sues",
  "wins",
  "loses",
  "denied",
  "granted",
  "ordered",
  "transferred",
  "separated",
  "removed",
  "targeted",
  "charged",
]);

/**
 * Try to extract a person's name from a headline.
 *
 * Handles patterns like:
 *   "Mahmoud Khalil: Palestinian Activist Detained..."  → "Mahmoud Khalil"
 *   "Venezuelan student Dylan Contreras released..."    → "Dylan Contreras"
 *   "ICE detains journalist Estefany Rodriguez..."      → "Estefany Rodriguez"
 *
 * Returns null if no name can be confidently extracted.
 */
export function extractPersonName(headline: string): string | null {
  if (!headline) return null;

  // Pattern 1: "Name Name: rest of headline" (colon-delimited)
  const colonMatch = headline.match(
    /^([A-Z][a-záéíóúñü]+(?:\s+[A-Z][a-záéíóúñü]+){1,3}):/
  );
  if (colonMatch) return colonMatch[1];

  // Pattern 2: Look for 2-4 consecutive capitalized words followed by an action word
  // e.g. "Dylan Lopez Contreras released from ICE"
  const words = headline.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const word = words[i].replace(/[,;'"]/g, "");

    // Skip if word starts lowercase or is a stop word
    if (!/^[A-Z]/.test(word)) continue;
    if (STOP_WORDS.has(word.toLowerCase())) continue;

    // Try to build a name sequence of 2-4 capitalized words
    const nameParts: string[] = [word];

    for (let j = i + 1; j < Math.min(i + 5, words.length); j++) {
      const next = words[j].replace(/[,;'"]/g, "");

      // Check if the NEXT word after our sequence is an action word
      if (ACTION_WORDS.has(next.toLowerCase())) {
        if (nameParts.length >= 2) {
          return nameParts.join(" ");
        }
        break;
      }

      // Continue building name if capitalized and not a stop word
      if (/^[A-Z]/.test(next) && !STOP_WORDS.has(next.toLowerCase())) {
        nameParts.push(next);
      } else {
        break;
      }
    }
  }

  return null;
}

/**
 * Given a list of incidents with headlines, group them by likely same-person matches
 * using name extraction and Latin American name matching.
 *
 * Returns a map of canonical name → array of incident IDs.
 * Only returns groups with 2+ incidents.
 */
export function findNameGroups(
  incidents: Array<{ id: number; headline: string }>
): Map<string, number[]> {
  // Extract names from headlines
  const named: Array<{ id: number; name: string }> = [];
  for (const inc of incidents) {
    const name = extractPersonName(inc.headline);
    if (name) {
      named.push({ id: inc.id, name });
    }
  }

  if (named.length < 2) return new Map();

  // Union-Find for clustering
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Compare all pairs
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const score = nameMatchScore(named[i].name, named[j].name);
      if (score >= 0.8) {
        union(named[i].id, named[j].id);
      }
    }
  }

  // Build groups
  const groups = new Map<number, { name: string; ids: number[] }>();
  for (const item of named) {
    const root = find(item.id);
    if (!groups.has(root)) {
      groups.set(root, { name: item.name, ids: [] });
    }
    groups.get(root)!.ids.push(item.id);
    // Keep the longest name variant as canonical
    if (item.name.length > groups.get(root)!.name.length) {
      groups.get(root)!.name = item.name;
    }
  }

  // Only return groups with 2+ members
  const result = new Map<string, number[]>();
  for (const group of groups.values()) {
    if (group.ids.length >= 2) {
      result.set(group.name, group.ids);
    }
  }

  return result;
}
