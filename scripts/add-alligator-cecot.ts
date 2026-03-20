/**
 * Adds Alligator Alcatraz and CECOT deportation stories to the incident pipeline.
 * Calls the local dev server's /api/submit endpoint for each URL.
 * Run: npx tsx scripts/add-alligator-cecot.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

import { Client } from "pg";

// ─── Article URLs to add ────────────────────────────────────────────────────

const URLS = [
  // --- ALLIGATOR ALCATRAZ ---
  // Lawmakers tour — men in cages, shouts of "libertad"
  "https://www.wlrn.org/immigration/2025-07-12/congressional-state-lawmakers-tour-alligator-alcatraz-see-men-in-cages-hear-pleas-of-libertad",
  // NBC News — lawmakers split on what they saw
  "https://www.nbcnews.com/politics/immigration/allowed-lawmakers-split-conditions-alligator-alcatraz-rcna218498",
  // CNN — Italian nationals Fernando Artese and Gaetano Costa detained
  "https://www.cnn.com/2025/07/21/europe/italian-nationals-alligator-alcatraz-intl-latam",
  // NBC News — hunger strike, Pedro Hernandez and Michael Borrego Fernandez
  "https://www.nbcnews.com/news/latino/alligator-alcatraz-hunger-strike-detainees-protest-conditions-rcna222554",
  // NPR — federal judge orders facility to wind down (environmental violations)
  "https://www.npr.org/2025/08/22/nx-s1-5510620/florida-alligator-alcatraz-immigration-ruling",
  // Amnesty International — torture and enforced disappearances report
  "https://www.amnestyusa.org/reports/torture-and-enforced-disappearances-in-the-sunshine-state-human-rights-violations-at-alligator-alcatraz-and-krome-in-florida/",
  // WLRN — Miccosukee Tribe legal fight, blocked burial sites
  "https://www.wlrn.org/immigration/2025-12-19/alligator-alcatraz-lawsuit-miccosukee-tribe",
  // Washington Post — detainees report maggot food, overflowing toilets, no meds
  "https://www.washingtonpost.com/nation/2025/07/16/alligator-alcatraz-conditions/",

  // --- CECOT DEPORTATIONS ---
  // NPR — Kilmar Abrego Garcia wrongfully deported, alleges torture
  "https://www.npr.org/2025/07/03/g-s1-75775/abrego-garcia-el-salvador-prison-beaten-torture",
  // CNN — Andry Hernandez Romero, gay Venezuelan deported over crown tattoos
  "https://www.cnn.com/2025/05/28/americas/romero-venezuela-deported-us-salvador-intl-latam",
  // NPR — Jerce Reyes Barrios, Venezuelan soccer coach deported over Real Madrid tattoo
  "https://www.npr.org/2025/03/27/nx-s1-5341544/ice-el-salvador-jerce-reyes-barrios",
  // NPR — "Hell on Earth" — Venezuelans describe brutal abuse at CECOT
  "https://www.npr.org/2025/07/27/nx-s1-5479143/hell-on-earth-venezuelans-deported-to-el-salvador-mega-prison-tell-of-brutal-abuse",
  // Texas Tribune — Carlos Daniel Teran (19, birthday in CECOT) and others
  "https://www.texastribune.org/2025/07/30/venezuelan-men-cecot-trump-salvadoran-prison-abuse/",
  // ProPublica — most deportees had no US criminal convictions
  "https://www.propublica.org/article/trump-el-salvador-deportees-criminal-convictions-cecot-venezuela",
  // HRW — torture report, systematic beatings, sexual violence, food denial
  "https://www.hrw.org/news/2025/11/12/us/el-salvador-torture-of-venezuelan-deportees",
  // NPR — El Salvador told UN that US legally controls CECOT detainees
  "https://www.npr.org/2025/07/08/g-s1-76491/migrants-salvadoran-prison-under-u-s-control",
  // CBS News / 60 Minutes — records show most deportees had no criminal records
  "https://www.cbsnews.com/news/what-records-show-about-migrants-sent-to-salvadoran-prison-60-minutes-transcript/",
  // ABC News — wrongful deportation of Abrego Garcia timeline
  "https://abcnews.go.com/US/timeline-wrongful-deportation-kilmar-abrego-garcia-el-salvador/story?id=120803843",
];

// ─── Submit via local API ────────────────────────────────────────────────────

async function submitUrl(url: string, key: string): Promise<{ created: boolean; message: string }> {
  try {
    const res = await fetch(`https://hiproject.org/api/submit?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`, {
      method: "GET",
    });
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

  console.log(`Submitting ${URLS.length} articles...\n`);

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
    // Small delay to avoid hammering the pipeline
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
}

main().catch(console.error);
