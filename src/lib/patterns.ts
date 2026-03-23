import { prisma } from "./db";

export type Insight = {
  type: "spike" | "cluster" | "trend";
  title: string;
  description: string;
  count: number;
  linkParams: string; // URL params to filter main page
};

export async function detectPatterns(): Promise<Insight[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  // Get recent incidents (last 30 days)
  const recent = await prisma.incident.findMany({
    where: {
      approved: true,
      headline: { not: null },
      parsedDate: { gte: thirtyDaysAgo },
    },
    select: { incidentType: true, location: true },
  });

  // Get prior period (30-60 days ago)
  const prior = await prisma.incident.findMany({
    where: {
      approved: true,
      headline: { not: null },
      parsedDate: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
    },
    select: { incidentType: true, location: true },
  });

  const insights: Insight[] = [];

  // Type spikes
  const recentTypes: Record<string, number> = {};
  const priorTypes: Record<string, number> = {};

  for (const inc of recent) {
    const tags = (inc.incidentType ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) recentTypes[tag] = (recentTypes[tag] ?? 0) + 1;
  }
  for (const inc of prior) {
    const tags = (inc.incidentType ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) priorTypes[tag] = (priorTypes[tag] ?? 0) + 1;
  }

  for (const [type, count] of Object.entries(recentTypes)) {
    const priorCount = priorTypes[type] ?? 0;
    if (count >= 5 && priorCount > 0) {
      const change = Math.round(((count - priorCount) / priorCount) * 100);
      if (change >= 50) {
        insights.push({
          type: "spike",
          title: `${type} incidents up ${change}%`,
          description: `${count} incidents in the past 30 days, up from ${priorCount} in the prior period`,
          count,
          linkParams: `tag=${encodeURIComponent(type)}&range=month`,
        });
      }
    } else if (count >= 5 && priorCount === 0) {
      insights.push({
        type: "spike",
        title: `${count} new ${type} incidents`,
        description: `${count} incidents in the past 30 days, none in the prior period`,
        count,
        linkParams: `tag=${encodeURIComponent(type)}&range=month`,
      });
    }
  }

  // Location clusters
  const recentLocations: Record<string, number> = {};
  for (const inc of recent) {
    const stateMatch = inc.location?.match(/,\s*([A-Z]{2})$/);
    if (stateMatch) {
      recentLocations[stateMatch[1]] = (recentLocations[stateMatch[1]] ?? 0) + 1;
    }
  }

  for (const [state, count] of Object.entries(recentLocations)) {
    if (count >= 10) {
      insights.push({
        type: "cluster",
        title: `${count} incidents in ${state} this month`,
        description: `High concentration of enforcement activity in ${state}`,
        count,
        linkParams: `location=${encodeURIComponent(state)}&range=month`,
      });
    }
  }

  // Sort by count descending
  insights.sort((a, b) => b.count - a.count);
  return insights.slice(0, 8);
}
