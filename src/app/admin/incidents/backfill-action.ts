"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parseIncidentDate, geocodeLocation } from "@/lib/geocode";

export async function backfillGeoData(): Promise<string> {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Unauthorized");

  // Backfill parsedDate
  const needsDate = await prisma.incident.findMany({
    where: { parsedDate: null, date: { not: null } },
    select: { id: true, date: true },
  });

  let dateCount = 0;
  for (const inc of needsDate) {
    const parsed = parseIncidentDate(inc.date);
    if (parsed) {
      await prisma.incident.update({
        where: { id: inc.id },
        data: { parsedDate: parsed },
      });
      dateCount++;
    }
  }

  // Backfill coordinates
  const needsGeo = await prisma.incident.findMany({
    where: { latitude: null, longitude: null, location: { not: null } },
    select: { id: true, location: true },
  });

  let geoCount = 0;
  for (const inc of needsGeo) {
    const coords = await geocodeLocation(inc.location!);
    if (coords) {
      await prisma.incident.update({
        where: { id: inc.id },
        data: { latitude: coords.lat, longitude: coords.lng },
      });
      geoCount++;
    }
    // Nominatim rate limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  revalidatePath("/admin");
  revalidatePath("/");

  return `Dates: ${dateCount}/${needsDate.length} parsed. Coordinates: ${geoCount}/${needsGeo.length} geocoded.`;
}
