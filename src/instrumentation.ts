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

      // Add altSources column if missing (was added after initial deploy)
      if (!colNames.includes("altSources")) {
        await prisma.$executeRaw`
          ALTER TABLE "Incident" ADD COLUMN "altSources" TEXT
        `;
        console.log("[migration] Added altSources column to Incident table");
      }
    } catch (err) {
      console.error("[migration] Error running startup migrations:", err);
    }
  }
}
