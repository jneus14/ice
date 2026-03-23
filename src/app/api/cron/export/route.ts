import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Nightly database export endpoint.
 * Call via Railway cron or external scheduler.
 * Returns full database as JSON for archival.
 *
 * GET /api/cron/export?key=SUBMIT_KEY
 *
 * Can also be triggered manually to download a backup.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const submitKey = process.env.SUBMIT_KEY;

  if (!submitKey || key !== submitKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incidents = await prisma.incident.findMany({
    where: { headline: { not: null } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      url: true,
      altSources: true,
      date: true,
      parsedDate: true,
      location: true,
      latitude: true,
      longitude: true,
      headline: true,
      summary: true,
      incidentType: true,
      country: true,
      imageUrl: true,
      status: true,
      approved: true,
      timeline: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const exportData = {
    exportDate: new Date().toISOString(),
    projectName: "Human Impact Project",
    projectUrl: "https://hiproject.org",
    totalIncidents: incidents.length,
    incidents,
  };

  // Return as downloadable JSON
  const json = JSON.stringify(exportData, null, 2);

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="hip-export-${new Date().toISOString().substring(0, 10)}.json"`,
    },
  });
}
