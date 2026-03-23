import { NextResponse } from "next/server";
import { detectPatterns } from "@/lib/patterns";

export const dynamic = "force-dynamic";

export async function GET() {
  const insights = await detectPatterns();
  return NextResponse.json({ insights });
}
