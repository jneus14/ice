/**
 * Cluster pending incidents that cover the same event.
 * Uses simple heuristics: keyword overlap in headlines + date/location proximity.
 * No AI calls — fast and deterministic.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "to", "for", "of", "and", "or", "is",
  "was", "are", "were", "by", "with", "from", "has", "have", "had", "be",
  "been", "being", "as", "its", "it", "he", "she", "they", "his", "her",
  "their", "this", "that", "not", "but", "after", "over", "says", "said",
  "new", "during", "about", "into", "under", "who", "what", "when", "how",
  "while", "amid", "may", "us", "up", "out", "no", "than",
]);

function headlineWords(headline: string | null): Set<string> {
  if (!headline) return new Set();
  return new Set(
    headline
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function cityFromLocation(location: string | null): string | null {
  if (!location) return null;
  // "San Francisco, CA" → "san francisco"
  const city = location.split(",")[0].trim().toLowerCase();
  return city.length > 0 ? city : null;
}

function daysBetween(d1: string | null, d2: string | null): number | null {
  if (!d1 || !d2) return null;
  const parse = (s: string) => {
    const [m, d, y] = s.split("/").map(Number);
    return m && d && y ? new Date(y, m - 1, d).getTime() : NaN;
  };
  const t1 = parse(d1);
  const t2 = parse(d2);
  if (isNaN(t1) || isNaN(t2)) return null;
  return Math.abs(t1 - t2) / 86400000;
}

export type ClusterableIncident = {
  id: number;
  headline: string | null;
  date: string | null;
  location: string | null;
  summary: string | null;
};

export type Cluster = {
  ids: number[];
  /** Highest similarity score within the cluster */
  confidence: number;
};

/**
 * Group incidents into clusters of stories covering the same event.
 * Returns clusters with 2+ incidents.
 */
export function clusterIncidents(incidents: ClusterableIncident[]): Cluster[] {
  if (incidents.length < 2) return [];

  // Build adjacency: which pairs are similar enough to merge
  const edges: Array<[number, number, number]> = []; // [idxA, idxB, score]

  const wordSets = incidents.map((i) => headlineWords(i.headline));

  for (let i = 0; i < incidents.length; i++) {
    for (let j = i + 1; j < incidents.length; j++) {
      const a = incidents[i];
      const b = incidents[j];

      // Headline keyword overlap
      const sim = jaccard(wordSets[i], wordSets[j]);

      // Location match bonus
      const cityA = cityFromLocation(a.location);
      const cityB = cityFromLocation(b.location);
      const sameCity = cityA && cityB && cityA === cityB;

      // Date proximity
      const days = daysBetween(a.date, b.date);
      const closeDate = days !== null && days <= 3;

      // Score: headline similarity is primary, location/date are bonuses
      let score = sim;
      if (sameCity) score += 0.15;
      if (closeDate) score += 0.1;

      // Threshold: need significant headline overlap
      if (score >= 0.35 && sim >= 0.25) {
        edges.push([i, j, score]);
      }
    }
  }

  // Union-find to build clusters
  const parent = incidents.map((_, i) => i);
  const maxScore = new Map<number, number>();

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number, score: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
    // Track max score for the cluster
    const root = find(a);
    maxScore.set(root, Math.max(maxScore.get(root) ?? 0, score));
  }

  for (const [a, b, score] of edges) {
    union(a, b, score);
  }

  // Collect clusters
  const groups = new Map<number, number[]>();
  for (let i = 0; i < incidents.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  return Array.from(groups.values())
    .filter((g) => g.length >= 2)
    .map((indices) => ({
      ids: indices.map((i) => incidents[i].id),
      confidence: maxScore.get(find(indices[0])) ?? 0,
    }));
}
