import { prisma } from "./db";

export type IncidentFilters = {
  search?: string;
  tags?: string[];
  location?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
  range?: string;
  page?: number;
  pageSize?: number;
};

function getDateCutoff(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3months":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "year":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default:
      return null;
  }
}

export async function getIncidents(filters: IncidentFilters = {}) {
  const { search, tags, location, country, range, dateFrom, dateTo, page = 1, pageSize = 50 } = filters;

  const where: any = {};
  const AND: any[] = [];

  if (search) {
    AND.push({
      OR: [
        { headline: { contains: search } },
        { summary: { contains: search } },
        { location: { contains: search } },
      ],
    });
  }

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      AND.push({ incidentType: { contains: tag } });
    }
  }

  if (location) {
    AND.push({ location: { contains: location } });
  }

  if (country) {
    AND.push({ country: { contains: country } });
  }

  if (range && range !== "all") {
    const cutoff = getDateCutoff(range);
    if (cutoff) {
      AND.push({ parsedDate: { gte: cutoff } });
    }
  }

  if (dateFrom) {
    AND.push({ parsedDate: { gte: new Date(dateFrom) } });
  }
  if (dateTo) {
    AND.push({ parsedDate: { lte: new Date(dateTo + "T23:59:59Z") } });
  }

  // Only show incidents that have a headline on the public site
  AND.push({ headline: { not: null } });

  where.AND = AND;

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      orderBy: [{ parsedDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        url: true,
        altSources: true,
        date: true,
        location: true,
        headline: true,
        summary: true,
        incidentType: true,
        country: true,
      },
    }),
    prisma.incident.count({ where }),
  ]);

  return { incidents, total, page, pageSize };
}

export async function getTotalWithHeadline(): Promise<number> {
  return prisma.incident.count({
    where: { headline: { not: null } },
  });
}

export async function getMapIncidents() {
  return prisma.incident.findMany({
    where: {
      headline: { not: null },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      headline: true,
      date: true,
      location: true,
      latitude: true,
      longitude: true,
      incidentType: true,
    },
  });
}

export async function getDistinctCountries(): Promise<string[]> {
  const results = await prisma.incident.findMany({
    where: { country: { not: null }, headline: { not: null } },
    select: { country: true },
  });
  const all = new Set<string>();
  for (const r of results) {
    if (!r.country) continue;
    r.country.split(",").forEach((c) => {
      const trimmed = c.trim();
      if (trimmed) all.add(trimmed);
    });
  }
  return Array.from(all).sort();
}
