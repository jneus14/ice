import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { path, referrer } = await req.json();
    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    // Skip admin and API paths
    if (path.startsWith("/admin") || path.startsWith("/api")) {
      return NextResponse.json({ ok: true });
    }

    await prisma.pageView.create({
      data: {
        path: path.substring(0, 500),
        referrer: referrer?.substring(0, 1000) || null,
        userAgent: req.headers.get("user-agent")?.substring(0, 500) || null,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") || "30");
  const since = new Date(Date.now() - days * 86400000);

  const [totalViews, viewsByPath, viewsByDay] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    prisma.pageView.groupBy({
      by: ["path"],
      _count: true,
      where: { createdAt: { gte: since } },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM "PageView"
      WHERE "createdAt" >= ${since}
      GROUP BY "createdAt"::date
      ORDER BY date
    `,
  ]);

  return NextResponse.json({
    totalViews,
    viewsByPath: viewsByPath.map((v) => ({ path: v.path, count: v._count })),
    viewsByDay,
  });
}
