export async function register() {
  // Only run in Node.js runtime (not edge), and only in production
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production"
  ) {
    const { prisma } = await import("./lib/db");

    try {
      // Check which columns exist on the Incident table
      const columns = await prisma.$queryRaw<{ name: string }[]>`
        PRAGMA table_info("Incident")
      `;
      const colNames = columns.map((c) => c.name);

      // Add any columns that were added after the initial Railway deploy
      const migrations: Array<{ col: string; sql: string }> = [
        { col: "altSources",  sql: `ALTER TABLE "Incident" ADD COLUMN "altSources" TEXT` },
        { col: "latitude",    sql: `ALTER TABLE "Incident" ADD COLUMN "latitude" REAL` },
        { col: "longitude",   sql: `ALTER TABLE "Incident" ADD COLUMN "longitude" REAL` },
        { col: "parsedDate",  sql: `ALTER TABLE "Incident" ADD COLUMN "parsedDate" DATETIME` },
      ];

      for (const { col, sql } of migrations) {
        if (!colNames.includes(col)) {
          await prisma.$executeRawUnsafe(sql);
          console.log(`[migration] Added ${col} column to Incident table`);
        }
      }
    } catch (err) {
      console.error("[migration] Error running startup migrations:", err);
    }
  }
}
