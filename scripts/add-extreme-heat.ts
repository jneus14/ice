/**
 * Adds extreme heat + immigration/ICE detention stories to the incident pipeline.
 * Calls the local dev server's /api/submit endpoint for each URL.
 * Run: npx tsx scripts/add-extreme-heat.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

const URLS = [
  // Washington Post — ICE detainees face greater heat risk than other prisoners (data investigation)
  "https://www.washingtonpost.com/climate-environment/interactive/2025/ice-detention-extreme-heat/",

  // KJZZ (Phoenix NPR) — Congresswoman visits Eloy; detainees describe forced outdoor marches in heat until they collapse
  "https://www.kjzz.org/politics/2025-06-18/arizona-congresswoman-demands-answers-about-conditions-at-eloy-detention-center",

  // Texas Tribune — Smugglers convicted in heat deaths of 53 migrants in a hot tractor-trailer in San Antonio
  "https://www.texastribune.org/2025/03/18/texas-smugglers-guilty-immigrant-deaths-san-antonio/",

  // Texas Tribune — El Paso joined Operation Lone Star, funneling migrants into extreme-heat New Mexico desert; deaths surged
  "https://www.texastribune.org/2025/06/16/texas-operation-lone-star-border-el-paso-deaths-migrants-new-mexico/",

  // Source New Mexico — Migrant remains found in NM desert surge after Texas border crackdown pushes people into lethal heat terrain
  "https://sourcenm.com/2025/06/16/deaths-in-the-new-mexico-desert-surge-after-texas-border-crackdown-reaches-el-paso/",

  // Public Health Watch — El Paso record heat deaths including migrants crossing border; city failing to invest in mitigation
  "https://publichealthwatch.org/2025/08/17/el-paso-heat-climate-migrants/",

  // Inside Climate News — El Paso extreme heat killing record numbers, including migrants in 115-degree desert temps
  "https://insideclimatenews.org/news/17082025/el-paso-extreme-heat-illness-death/",

  // El Paso Matters — Heat crisis: El Paso deaths soar to record levels; first heat death of 2025 in June at 103°F
  "https://elpasomatters.org/2025/08/21/el-paso-weather-extreme-heat-illness-deaths/",

  // Texas Observer — Border physician describes Guatemalan woman found with 107°F body temp in desert, later died
  "https://www.texasobserver.org/el-paso-migrant-death-heat/",

  // PBS NewsHour — Extreme heat in prisons/detention bringing legal challenges; ICE facilities disproportionately in hottest regions
  "https://www.pbs.org/newshour/nation/extreme-heat-in-prisons-brings-more-legal-challenges-and-pressure-to-states",

  // NPR — 2025 deadliest year in ICE custody in decades; heat, overcrowding at near 60,000 detainees
  "https://www.npr.org/2025/10/23/nx-s1-5538090/ice-detention-custody-immigration-arrest-enforcement-dhs-trump",
];

async function submitUrl(url: string, key: string): Promise<{ created: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://hiproject.org/api/submit?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`,
      { method: "GET" }
    );
    const data = await res.json();
    if (res.status === 200 || res.status === 201) {
      return { created: true, message: `created id=${data.id ?? "?"}` };
    } else if (res.status === 409) {
      return { created: false, message: "already exists" };
    } else {
      return { created: false, message: `error ${res.status}: ${JSON.stringify(data)}` };
    }
  } catch (err: any) {
    return { created: false, message: `fetch error: ${err.message}` };
  }
}

async function main() {
  const key = process.env.SUBMIT_KEY;
  if (!key) {
    console.error("SUBMIT_KEY not found in .env.local");
    process.exit(1);
  }

  console.log(`Submitting ${URLS.length} extreme heat articles...\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const url of URLS) {
    const { created: ok, message } = await submitUrl(url, key);
    const icon = ok ? "✓" : message.includes("already exists") ? "–" : "✗";
    console.log(`${icon} ${message.padEnd(25)} ${url.slice(0, 75)}`);
    if (ok) created++;
    else if (message.includes("already exists")) skipped++;
    else errors++;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
}

main().catch(console.error);
