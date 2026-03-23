import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildFilterWhere, parseFiltersFromParams } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filters = parseFiltersFromParams(params);
  const where = buildFilterWhere(filters);
  const granularity = params.get("granularity") ?? "month"; // week | month

  // Fetch all matching incidents
  const incidents = await prisma.incident.findMany({
    where,
    select: {
      parsedDate: true,
      incidentType: true,
      location: true,
      country: true,
    },
  });

  // Time series
  const timeSeries: Record<string, number> = {};
  for (const inc of incidents) {
    if (!inc.parsedDate) continue;
    const d = inc.parsedDate;
    let key: string;
    if (granularity === "week") {
      const day = d.getDay();
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - day);
      key = weekStart.toISOString().substring(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    timeSeries[key] = (timeSeries[key] ?? 0) + 1;
  }

  // By type
  const byType: Record<string, number> = {};
  for (const inc of incidents) {
    const tags = (inc.incidentType ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tag of tags) {
      byType[tag] = (byType[tag] ?? 0) + 1;
    }
  }

  // By state
  const byState: Record<string, number> = {};
  for (const inc of incidents) {
    const stateMatch = inc.location?.match(/,\s*([A-Z]{2})$/);
    if (stateMatch) {
      byState[stateMatch[1]] = (byState[stateMatch[1]] ?? 0) + 1;
    }
  }

  // By country
  const byCountry: Record<string, number> = {};
  for (const inc of incidents) {
    if (inc.country) {
      const countries = inc.country.split(",").map((c) => c.trim()).filter(Boolean);
      for (const c of countries) {
        byCountry[c] = (byCountry[c] ?? 0) + 1;
      }
    }
  }

  return NextResponse.json({
    total: incidents.length,
    timeSeries: Object.entries(timeSeries)
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    byType: Object.entries(byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    byState: Object.entries(byState)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
    byCountry: Object.entries(byCountry)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  });
}
