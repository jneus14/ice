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

  // Parse date string to a Date object for parsedDate
  let parsedDate: Date | null = null;
  if (date && date.trim()) {
    const d = new Date(date.trim() + "T12:00:00Z");
    if (!isNaN(d.getTime())) parsedDate = d;
  }

  await prisma.incident.update({
    where: { id },
    data: {
      headline: headline ?? null,
      date: date?.trim() || null,
      parsedDate,
      location: location?.trim() || null,
      summary: summary?.trim() || null,
      incidentType: incidentType?.trim() || null,
      country: country?.trim() || null,
      ...(url?.trim() ? { url: url.trim() } : {}),
      altSources: altSources ?? null,
      ...(timeline !== undefined ? { timeline: timeline } : {}),
      ...(reviewedA !== undefined ? { reviewedA } : {}),
      ...(reviewedJ !== undefined ? { reviewedJ } : {}),
      ...(reviewedP !== undefined ? { reviewedP } : {}),
      ...(excludePoster !== undefined ? { excludePoster } : {}),
    },
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
