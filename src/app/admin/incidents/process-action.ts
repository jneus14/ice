"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { processIncidentPipeline } from "@/lib/pipeline";

export async function processIncident(id: number) {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Unauthorized");

  await processIncidentPipeline(id);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function processAllIncomplete(): Promise<string> {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Unauthorized");

  const incidents = await prisma.incident.findMany({
    where: {
      OR: [
        { status: "RAW" },
        { status: "FAILED" },
        { headline: null },
        { summary: null },
        // Include unapproved entries that may need re-processing
        { status: "COMPLETE", approved: false },
      ],
    },
    select: { id: true, status: true, headline: true, summary: true, approved: true },
  });

  // For COMPLETE+unapproved entries, only re-process if they're missing key content
  const toProcess = incidents.filter((inc) => {
    if (inc.status !== "COMPLETE") return true;
    if (!inc.approved && (!inc.headline || !inc.summary)) return true;
    return false;
  });

  let succeeded = 0;
  let failed = 0;

  for (const inc of toProcess) {
    try {
      await processIncidentPipeline(inc.id);
      succeeded++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return `Processed ${toProcess.length}: ${succeeded} succeeded, ${failed} failed`;
}

export async function processSelected(ids: number[]): Promise<string> {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Unauthorized");

  if (ids.length === 0) return "No incidents selected";

  let succeeded = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await processIncidentPipeline(id);
      succeeded++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return `Processed ${ids.length}: ${succeeded} succeeded, ${failed} failed`;
}
