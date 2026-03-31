import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EDIT_PASSWORD = "acab";

function checkAuth(req: NextRequest): boolean {
  return req.headers.get("x-edit-password") === EDIT_PASSWORD;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const { headline, date, location, summary, incidentType, country, url, altSources, timeline, reviewedA, reviewedJ, reviewedP, excludePoster } = body;

  // Build update data only from fields explicitly provided in the request
  const data: Record<string, unknown> = {};

  if ("headline" in body) data.headline = headline ?? null;
  if ("date" in body) {
    data.date = date?.trim() || null;
    // Parse date string to a Date object for parsedDate
    let parsedDate: Date | null = null;
    if (date && date.trim()) {
      const d = new Date(date.trim() + "T12:00:00Z");
      if (!isNaN(d.getTime())) parsedDate = d;
    }
    data.parsedDate = parsedDate;
  }
  if ("location" in body) data.location = location?.trim() || null;
  if ("summary" in body) data.summary = summary?.trim() || null;
  if ("incidentType" in body) data.incidentType = incidentType?.trim() || null;
  if ("country" in body) data.country = country?.trim() || null;
  if ("url" in body && url?.trim()) data.url = url.trim();
  if ("altSources" in body) data.altSources = altSources ?? null;
  if ("timeline" in body) data.timeline = timeline;
  if ("reviewedA" in body) data.reviewedA = reviewedA;
  if ("reviewedJ" in body) data.reviewedJ = reviewedJ;
  if ("reviewedP" in body) data.reviewedP = reviewedP;
  if ("excludePoster" in body) data.excludePoster = excludePoster;

  await prisma.incident.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await prisma.incident.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
