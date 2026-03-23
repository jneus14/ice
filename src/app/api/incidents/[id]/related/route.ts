import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractPersonName, nameMatchScore } from "@/lib/name-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: {
      headline: true,
      summary: true,
      incidentType: true,
      location: true,
      country: true,
      parsedDate: true,
    },
  });

  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Extract matching criteria
  const tags = (incident.incidentType ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const state = incident.location?.match(/,\s*([A-Z]{2})$/)?.[1] ?? null;
  const name = extractPersonName(incident.headline ?? "");
  const date = incident.parsedDate;

  // Fetch candidates (recent approved incidents)
  const candidates = await prisma.incident.findMany({
    where: {
      id: { not: id },
      status: "COMPLETE",
      approved: true,
      headline: { not: null },
    },
    orderBy: { parsedDate: "desc" },
    take: 200,
    select: {
      id: true,
      headline: true,
      summary: true,
      date: true,
      location: true,
      incidentType: true,
      country: true,
      parsedDate: true,
    },
  });

  const scored = candidates.map((c) => {
    let score = 0;

    // Tag overlap (high weight)
    const cTags = (c.incidentType ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tagOverlap = tags.filter((t) => cTags.includes(t)).length;
    score += tagOverlap * 3;

    // Same state (medium weight)
    if (state) {
      const cState = c.location?.match(/,\s*([A-Z]{2})$/)?.[1] ?? null;
      if (cState === state) score += 5;
    }

    // Same country (low weight)
    if (incident.country && c.country === incident.country) score += 2;

    // Date proximity (medium weight — within 30 days)
    if (date && c.parsedDate) {
      const daysDiff =
        Math.abs(date.getTime() - c.parsedDate.getTime()) / 86400000;
      if (daysDiff <= 7) score += 4;
      else if (daysDiff <= 30) score += 2;
      else if (daysDiff <= 90) score += 1;
    }

    // Name match (highest weight)
    if (name) {
      const cName = extractPersonName(c.headline ?? "");
      if (cName) {
        const ns = nameMatchScore(name, cName);
        if (ns > 0.7) score += 15;
        else if (ns > 0.4) score += 8;
      }
    }

    return {
      id: c.id,
      headline: c.headline,
      date: c.date,
      location: c.location,
      score,
    };
  });

  const related = scored
    .filter((s) => s.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return NextResponse.json({ related });
}
