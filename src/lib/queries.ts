import { prisma } from "./db";

export function parseFiltersFromParams(params: URLSearchParams): IncidentFilters {
  return {
    search: params.get("q") || undefined,
    tags: params.getAll("tag").length > 0 ? params.getAll("tag") : undefined,
    tagMode: (params.get("tagMode") as "all" | "any") || undefined,
    location: params.get("location") || undefined,
    country: params.get("country") || undefined,
    dateFrom: params.get("from") || undefined,
    dateTo: params.get("to") || undefined,
    range: params.get("range") || undefined,
  };
}

export type IncidentFilters = {
  search?: string;
  tags?: string[];
  tagMode?: "all" | "any";
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

export function buildFilterWhere(filters: IncidentFilters): any {
  const { search, tags, tagMode = "all", location, country, range, dateFrom, dateTo } = filters;
  const AND: any[] = [];

  if (search) {
    AND.push({
      OR: [
        { headline: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (tags && tags.length > 0) {
    if (tagMode === "any") {
      AND.push({
        OR: tags.map((tag) => ({ incidentType: { contains: tag } })),
      });
    } else {
      for (const tag of tags) {
        AND.push({ incidentType: { contains: tag } });
      }
    }
  }

  if (location) {
    // Map full state names to abbreviations for flexible matching
    const stateMap: Record<string, string> = {
      alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
      colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
      hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
      kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
      massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
      missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
      "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
      "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
      oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
      "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
      virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
      wyoming: "WY", "district of columbia": "DC",
    };
    const lower = location.toLowerCase().trim();
    const abbrev = stateMap[lower];
    if (abbrev) {
      // Match either the full state name or abbreviation in location field
      AND.push({
        OR: [
          { location: { contains: location, mode: "insensitive" } },
          { location: { contains: `, ${abbrev}`, mode: "insensitive" } },
          { location: { contains: `${abbrev},`, mode: "insensitive" } },
        ],
      });
    } else {
      AND.push({ location: { contains: location, mode: "insensitive" } });
    }
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

  AND.push({ headline: { not: null } });
  AND.push({ approved: true });

  return { AND };
}

export async function getIncidents(filters: IncidentFilters = {}) {
  // When browsing by month (date filters set), show all results for that period
  const hasDateFilter = !!(filters.dateFrom || filters.dateTo || filters.range);
  const { page = 1, pageSize = hasDateFilter ? 500 : 50 } = filters;
  const where = buildFilterWhere(filters);

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      orderBy: [{ parsedDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: hasDateFilter ? 0 : (page - 1) * pageSize,
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
        imageUrl: true,
        timeline: true,
        approved: true,
      },
    }),
    prisma.incident.count({ where }),
  ]);

  return { incidents, total, page, pageSize };
}

export async function getTotalWithHeadline(filters: IncidentFilters = {}): Promise<number> {
  // Count across all months (no date filter), but respect other filters
  const { dateFrom: _, dateTo: __, range: ___, page: ____, ...rest } = filters;
  const where = buildFilterWhere(rest);
  return prisma.incident.count({ where });
}

export async function getMapIncidents(filters: IncidentFilters = {}) {
  const where = buildFilterWhere(filters);
  // Also require coordinates for map display
  where.AND.push({ latitude: { not: null } });
  where.AND.push({ longitude: { not: null } });

  return prisma.incident.findMany({
    where,
    select: {
      id: true,
      url: true,
      headline: true,
      summary: true,
      date: true,
      location: true,
      latitude: true,
      longitude: true,
      incidentType: true,
      altSources: true,
    },
  });
}

export async function getPendingIncidents() {
  return prisma.incident.findMany({
    where: {
      status: "COMPLETE",
      approved: false,
      headline: { not: null },
    },
    orderBy: [{ parsedDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
      imageUrl: true,
      timeline: true,
      approved: true,
    },
  });
}

export async function getDistinctCountries(): Promise<string[]> {
  const results = await prisma.incident.findMany({
    where: { country: { not: null }, headline: { not: null }, approved: true },
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
