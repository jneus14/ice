/**
 * One-time backfill script to populate parsedDate, latitude, longitude
 * for existing incidents that have date/location strings but no parsed values.
 *
 * Usage: npx tsx scripts/backfill-geo.ts
 */
import { PrismaClient } from "@prisma/client";
import { parseIncidentDate, geocodeLocation } from "../src/lib/geocode";

const prisma = new PrismaClient();

async function main() {
  // Backfill parsedDate
  const needsDate = await prisma.incident.findMany({
    where: { parsedDate: null, date: { not: null } },
    select: { id: true, date: true },
  });

  console.log(`Backfilling parsedDate for ${needsDate.length} incidents...`);
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
  console.log(`  Updated ${dateCount} incidents with parsedDate.`);

  // Backfill coordinates
  const needsGeo = await prisma.incident.findMany({
    where: { latitude: null, longitude: null, location: { not: null } },
    select: { id: true, location: true },
  });

  console.log(`Geocoding ${needsGeo.length} incidents...`);
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
  console.log(`  Updated ${geoCount} incidents with coordinates.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
