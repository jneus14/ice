import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processIncidentPipeline } from "@/lib/pipeline";

function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return raw;
  }
}

async function handleSubmit(req: NextRequest): Promise<NextResponse> {
  const submitKey = process.env.SUBMIT_KEY;
  if (!submitKey) {
    return NextResponse.json({ error: "Submit endpoint not configured" }, { status: 503 });
  }

  // Key from query param or Authorization header
  const params = req.nextUrl.searchParams;
  const providedKey =
    params.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!providedKey || providedKey !== submitKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // URL from query param or JSON body
  let url = params.get("url") ?? null;
  if (!url && req.method === "POST") {
    try {
      const body = await req.json();
      url = typeof body?.url === "string" ? body.url : null;
    } catch {
      // ignore parse error — URL may have been passed via query param only
    }
  }

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Missing or invalid url parameter" }, { status: 400 });
  }

  url = cleanUrl(url);

  // Duplicate check
  const existing = await prisma.incident.findFirst({
    where: { url },
    select: { id: true, headline: true, status: true },
  });
  if (existing) {
    return NextResponse.json({
      duplicate: true,
      id: existing.id,
      headline: existing.headline,
      status: existing.status,
      url,
    });
  }

  // Create and queue
  const incident = await prisma.incident.create({ data: { url, status: "RAW" } });

  // Fire-and-forget: Instagram gets its pipeline, everything else gets the standard one
  processIncidentPipeline(incident.id).catch((err) => {
    console.error(`[submit-api] Pipeline failed for #${incident.id}:`, err.message);
  });

  return NextResponse.json({ queued: true, id: incident.id, url }, { status: 201 });
}

export async function GET(req: NextRequest) {
  return handleSubmit(req);
}

export async function POST(req: NextRequest) {
  return handleSubmit(req);
}
