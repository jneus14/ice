import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, message } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const feedback = await prisma.feedback.create({
      data: {
        name: name?.trim() || null,
        email: email?.trim() || null,
        message: message.trim().substring(0, 5000),
      },
    });

    return NextResponse.json({ success: true, id: feedback.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Admin only — check edit password
  if (req.headers.get("x-edit-password") !== "acab") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedback = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ feedback });
}
