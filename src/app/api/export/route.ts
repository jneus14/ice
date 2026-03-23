import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildFilterWhere, parseFiltersFromParams } from "@/lib/queries";

/**
 * Public data export endpoint.
 * Returns approved incidents as JSON or CSV, with optional filters.
 *
 * GET /api/export?format=csv&q=keyword&tag=Death&location=Texas&from=2025-01-01
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const format = params.get("format") ?? "json";

  const filters = parseFiltersFromParams(params);
  const where = buildFilterWhere(filters);

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: [
      { parsedDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      url: true,
      altSources: true,
      date: true,
      location: true,
      latitude: true,
      longitude: true,
      headline: true,
      summary: true,
      incidentType: true,
      country: true,
      createdAt: true,
    },
  });

  if (format === "csv") {
    const headers = [
      "id",
      "date",
      "location",
      "headline",
      "summary",
      "incident_type",
      "country",
      "latitude",
      "longitude",
      "url",
      "alt_sources",
      "created_at",
    ];

    function csvEscape(val: string | null | undefined): string {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const rows = incidents.map((inc) =>
      [
        inc.id,
        inc.date,
        inc.location,
        inc.headline,
        inc.summary,
        inc.incidentType,
        inc.country,
        inc.latitude,
        inc.longitude,
        inc.url,
        inc.altSources,
        inc.createdAt?.toISOString(),
      ]
        .map((v) => csvEscape(v != null ? String(v) : null))
        .join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const date = new Date().toISOString().substring(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hip-export-${date}.csv"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // JSON format
  const exportData = {
    exportDate: new Date().toISOString(),
    projectName: "Human Impact Project",
    projectUrl: "https://hiproject.org",
    totalIncidents: incidents.length,
    incidents,
  };

  return NextResponse.json(exportData, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
