/**
 * Export all incidents from local SQLite dev.db to a JSON file.
 * Run this BEFORE switching DATABASE_URL to PostgreSQL.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  const incidents = await prisma.incident.findMany({ orderBy: { id: "asc" } });
  const outPath = resolve(__dirname, "../prisma/sqlite-export.json");
  writeFileSync(outPath, JSON.stringify(incidents, null, 2));
  console.log(`Exported ${incidents.length} incidents to ${outPath}`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
