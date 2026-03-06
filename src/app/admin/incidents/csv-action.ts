"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { parse } from "csv-parse/sync";

export async function uploadCsv(formData: FormData): Promise<string> {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("No file provided");

  const text = await file.text();
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  let created = 0;
  let skipped = 0;

  for (const row of records as Record<string, string>[]) {
    const url = row.link || row.url || row.URL || row.Link || row.source || "";
    if (!url.trim()) {
      skipped++;
      continue;
    }

    const hasData = row.headline || row.Headline || row.summary || row.Summary || row.incident_type || row.incidentType;

    try {
      await prisma.incident.upsert({
        where: { url: url.trim() },
        update: {},
        create: {
          url: url.trim(),
          altSources: row.alt_source || row.altSources || null,
          date: row.date || row.Date || null,
          location: row.location || row.Location || null,
          headline: row.headline || row.Headline || null,
          summary: row.summary || row.Summary || null,
          incidentType: row.incident_type || row.incidentType || null,
          country: row.country_of_origin || row.country || null,
          status: hasData ? "COMPLETE" : "RAW",
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return `Imported ${created} incidents, skipped ${skipped}`;
}
