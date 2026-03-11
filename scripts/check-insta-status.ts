import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const JUNK = ["instagram.com","instagr.am","facebook.com","fb.com","tiktok.com","twitter.com","t.co","x.com","threads.net","dlvr.it","ow.ly","buff.ly","bit.ly"];

function isJunk(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return JUNK.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return JUNK.some((d) => url.includes(d));
  }
}

async function main() {
  // Check 783 specifically
  const r783 = await prisma.incident.findUnique({ where: { id: 783 }, select: { headline: true, altSources: true, status: true } });
  const urls783 = JSON.parse(r783?.altSources ?? "[]") as string[];
  const news783 = urls783.filter((u) => !isJunk(u));
  console.log("=== #783 ===");
  console.log("Status:", r783?.status);
  console.log("Alt sources:", urls783);
  console.log("News sources:", news783);

  // Overall stats
  const all = await prisma.incident.findMany({
    where: { status: "COMPLETE", url: { contains: "instagram.com" } },
    select: { id: true, altSources: true },
  });
  let noNews = 0, hasNews = 0;
  for (const inc of all) {
    let urls: string[] = [];
    try { urls = JSON.parse(inc.altSources ?? "[]"); } catch { if (inc.altSources) urls = [inc.altSources]; }
    const news = urls.filter((u) => !isJunk(u));
    if (news.length === 0) noNews++; else hasNews++;
  }
  console.log(`\nTotal Instagram: ${all.length} | With news: ${hasNews} | Missing news: ${noNews}`);
  await prisma.$disconnect();
}
main().catch(console.error);
