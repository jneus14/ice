import { NextResponse } from "next/server";
import { detectPatterns } from "@/lib/patterns";

export const revalidate = 3600; // Cache for 1 hour

export async function GET() {
  const insights = await detectPatterns();
  return NextResponse.json({ insights });
}
