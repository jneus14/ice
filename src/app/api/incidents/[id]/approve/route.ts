import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EDIT_PASSWORD = "acab";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await prisma.incident.update({
    where: { id },
    data: { approved: true },
  });

  return NextResponse.json({ success: true });
}
