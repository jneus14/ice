import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");
  const radius = parseFloat(params.get("radius") ?? "50"); // miles

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(
      { error: "lat and lng required" },
      { status: 400 }
    );
  }

  // Haversine formula in SQL — distance in miles
  const incidents = await prisma.$queryRaw<
    Array<{
      id: number;
      url: string;
      headline: string;
      date: string | null;
      location: string | null;
      summary: string | null;
      incidentType: string | null;
      latitude: number;
      longitude: number;
      distance: number;
    }>
  >`
    SELECT
      id, url, headline, date, location, summary, "incidentType",
      latitude, longitude,
      (3959 * acos(
        cos(radians(${lat})) * cos(radians(latitude)) *
        cos(radians(longitude) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(latitude))
      )) AS distance
    FROM "Incident"
    WHERE approved = true
      AND headline IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    HAVING (3959 * acos(
      cos(radians(${lat})) * cos(radians(latitude)) *
      cos(radians(longitude) - radians(${lng})) +
      sin(radians(${lat})) * sin(radians(latitude))
    )) < ${radius}
    ORDER BY distance ASC
    LIMIT 50
  `;

  return NextResponse.json({
    total: incidents.length,
    radius,
    center: { lat, lng },
    incidents: incidents.map((inc) => ({
      ...inc,
      distance: Math.round(inc.distance * 10) / 10,
    })),
  });
}
