import { prisma } from "./db";

export type IncidentFilters = {
  search?: string;
  tags?: string[];
  location?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export async function getIncidents(filters: IncidentFilters = {}) {
  const { search, tags, location, country, page = 1, pageSize = 50 } = filters;

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
    AND.push({
      OR: tags.map((tag) => ({
        incidentType: { contains: tag },
      })),
    });
  }

  if (location) {
    AND.push({ location: { contains: location } });
  }

  if (country) {
    AND.push({ country: { contains: country } });
  }

  if (AND.length > 0) {
    where.AND = AND;
  }

  // Only show incidents that have at least a headline or summary or incident type for public view
  where.OR = [
    { headline: { not: null } },
    { summary: { not: null } },
    { incidentType: { not: null } },
  ];

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        url: true,
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

export async function getDistinctCountries(): Promise<string[]> {
  const results = await prisma.incident.findMany({
    where: { country: { not: null } },
    select: { country: true },
    distinct: ["country"],
    orderBy: { country: "asc" },
  });
  return results.map((r) => r.country!).filter(Boolean);
}
