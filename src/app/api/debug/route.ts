import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const info: Record<string, unknown> = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ?? "NOT SET",
    SESSION_SECRET_SET: !!process.env.SESSION_SECRET,
    SESSION_SECRET_LENGTH: process.env.SESSION_SECRET?.length ?? 0,
  };

  try {
    const count = await prisma.incident.count();
    info.db_status = "OK";
    info.incident_count = count;
  } catch (err: unknown) {
    info.db_status = "ERROR";
    info.db_error =
      err instanceof Error ? err.message : String(err);
    info.db_error_stack =
      err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : undefined;
  }

  // Test if altSources column exists
  try {
    await prisma.incident.findFirst({ select: { altSources: true } });
    info.altSources_column = "EXISTS";
  } catch (err: unknown) {
    info.altSources_column = "MISSING";
    info.altSources_error = err instanceof Error ? err.message : String(err);
  }

  // Test the actual page query (getIncidents equivalent)
  try {
    const first = await prisma.incident.findMany({
      where: { AND: [{ headline: { not: null } }] },
      take: 1,
      select: { id: true, url: true, altSources: true, headline: true },
    });
    info.page_query = "OK";
    info.page_query_sample = first[0] ?? null;
  } catch (err: unknown) {
    info.page_query = "ERROR";
    info.page_query_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(info);
}
