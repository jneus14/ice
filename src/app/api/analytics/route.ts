import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildFilterWhere, parseFiltersFromParams } from "@/lib/queries";
import { INCIDENT_TYPE_TAGS, PERSON_IMPACTED_TAGS } from "@/lib/constants";

const INCIDENT_TYPE_VALUES = new Set(INCIDENT_TYPE_TAGS.map((t) => t.value));
const PERSON_IMPACTED_VALUES = new Set(PERSON_IMPACTED_TAGS.map((t) => t.value));

// All analytics start from Jan 2025
const TIMELINE_START = new Date("2025-01-01T00:00:00Z");

function getIncidentTypeLabel(value: string): string {
  return INCIDENT_TYPE_TAGS.find((t) => t.value === value)?.label ?? value;
}

function getPersonImpactedLabel(value: string): string {
  return PERSON_IMPACTED_TAGS.find((t) => t.value === value)?.label ?? value;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filters = parseFiltersFromParams(params);
  const where = buildFilterWhere(filters);
  const granularity = params.get("granularity") ?? "month"; // week | month

  // Enforce minimum start date
  where.parsedDate = {
    ...(typeof where.parsedDate === "object" && where.parsedDate !== null
      ? where.parsedDate
      : {}),
    gte: TIMELINE_START,
  };

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

  // Pre-fill periods from Jan 2025 to now
  const now = new Date();
  if (granularity === "month") {
    let cursor = new Date(TIMELINE_START);
    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      timeSeries[key] = 0;
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    // weekly: fill from Jan 2025 week by week
    let cursor = new Date(TIMELINE_START);
    // Align to Sunday
    cursor.setDate(cursor.getDate() - cursor.getDay());
    while (cursor <= now) {
      timeSeries[cursor.toISOString().substring(0, 10)] = 0;
      cursor.setDate(cursor.getDate() + 7);
    }
  }

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

  // By incident type (only known tags, using labels)
  const byIncidentType: Record<string, number> = {};
  // By person impacted (only known tags, using labels)
  const byPersonImpacted: Record<string, number> = {};

  for (const inc of incidents) {
    const tags = (inc.incidentType ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tag of tags) {
      if (INCIDENT_TYPE_VALUES.has(tag)) {
        const label = getIncidentTypeLabel(tag);
        byIncidentType[label] = (byIncidentType[label] ?? 0) + 1;
      } else if (PERSON_IMPACTED_VALUES.has(tag)) {
        const label = getPersonImpactedLabel(tag);
        byPersonImpacted[label] = (byPersonImpacted[label] ?? 0) + 1;
      }
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
    byIncidentType: Object.entries(byIncidentType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    byPersonImpacted: Object.entries(byPersonImpacted)
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
