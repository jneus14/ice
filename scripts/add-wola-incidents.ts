import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

// Curated list from WOLA border updates — specific incidents, Jan 2025+
// Skipping: policy pieces, CBP official pages, Mexican legal cases, Panama stranding (not US-based)
const URLS = [
  // Deportation flight abuses — Brazil
  "https://www.nytimes.com/2025/01/28/world/americas/us-brazil-deportations.html",
  "https://www1.folha.uol.com.br/internacional/en/world/2025/01/afraid-to-die-treated-like-dogs-what-deported-brazilians-say.shtml",

  // Deportation flight abuses — Colombia
  "https://www.cnn.com/2025/01/29/americas/colombia-migrants-deportations-trump-intl-latam/index.html",
  "https://www.wsj.com/world/americas/deported-colombian-migrants-complain-of-despotic-humiliating-treatment-20a6bf17",

  // Deportation flight abuses — India (shackled 40 hours)
  "https://www.nytimes.com/2025/02/05/world/asia/migrants-deported-india-us.html",
  "https://www.cnn.com/2025/02/07/india/india-trump-shcakles-deportations-intl-hnk/index.html",
  "https://www.cbsnews.com/news/us-deported-indian-migrants-handcuffs-leg-chains-military-flight-india/",

  // Guantánamo — named individuals
  "https://www.nytimes.com/2025/02/11/world/americas/luis-castillo-venezuela-migrant-guantanamo-bay-trump.html",
  "https://www.propublica.org/article/trump-administration-migrants-guantanamo-bay",
  "https://www.usatoday.com/story/news/nation/2025/02/12/guantanamo-immigrants-rights-violation-worst/78434687007/",
  "https://www.cnn.com/2025/03/12/americas/venezuela-guantanamo-detainee-deported-trump-intl-latam/index.html",
  "https://www.nytimes.com/2025/03/12/us/politics/ice-migrants-guantanamo.html",
  "https://www.thebulwark.com/p/when-dhs-sends-your-son-to-guantanamo-trump-deportation-policy",
  "https://apnews.com/article/immigration-detention-guantanamo-venezuela-new-mexico-ice-8fa3d0d5ef2e0a50061aba04f1a13845",

  // ICE raids detaining U.S. citizens
  "https://www.washingtonpost.com/immigration/2025/01/28/new-york-city-ice-raid/",
  "https://www.texastribune.org/2025/01/29/texas-immigration-lubbock-police-traffic-stop-ice-deportation/",
  "https://www.nbcnews.com/news/latino/trump-immigration-raids-citizens-profiling-accusations-native-american-rcna189203",
  "https://www.latintimes.com/ice-says-sorry-after-detaining-us-citizens-speaking-spanish-report-573967",
  "https://www.denverpost.com/2025/02/16/ice-raid-denver-cruel-immigrants-fear/",
  "https://www.latimes.com/politics/story/2025-03-12/venezuelan-couple-charged-with-illegal-entry-two-years-after-crossing-the-border",
  "https://www.npr.org/2025/03/13/nx-s1-5326015/mahmoud-khalil-deportation-arrests-trump",

  // US citizen children deported with parents
  "https://www.nbcnews.com/news/latino/us-citizen-child-recovering-brain-cancer-deported-mexico-undocumented-rcna196049",
  "https://azluminaria.org/2025/02/16/venezuelan-migrant-mother-and-two-children-deported-to-mexico-just-hours-after-tucson-traffic-stop/",

  // Family detention with children
  "https://www.cbsnews.com/news/trump-revives-practice-of-detaining-migrant-families-with-children/",
  "https://apnews.com/article/immigration-detention-texas-border-c008c78469d85a7c1962a6b36ac29330",
  "https://www.theguardian.com/us-news/2025/mar/12/trump-immigration-family-detention-children",

  // ICE raids on farmworker communities
  "https://www.nytimes.com/2025/01/17/us/immigration-deportation-california.html",
  "https://www.latimes.com/politics/story/2025-01-11/they-just-got-my-uncle-mass-immigration-arrests-spark-fear-among-farmworkers-in-central-valley",

  // Military deportation accountability — troops ordered to remove name patches
  "https://www.military.com/daily-news/2025/02/07/air-force-has-troops-remove-names-unit-patches-uniforms-during-deportation-flights.html",

  // Officer misconduct — BP agent demanded women expose breasts at border
  "https://www.usatoday.com/story/news/nation/2025/03/10/border-patrol-agent-women-expose-breasts/82232289007/",
];

async function submitUrl(url: string, key: string): Promise<{ created: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://hiproject.org/api/submit?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`,
      { method: "GET" }
    );
    const data = await res.json();
    if (res.status === 200 || res.status === 201) {
      return { created: true, message: `id=${data.id ?? "?"}` };
    } else if (res.status === 409) {
      return { created: false, message: "already exists" };
    } else {
      return { created: false, message: `error ${res.status}: ${JSON.stringify(data).slice(0, 80)}` };
    }
  } catch (err: any) {
    return { created: false, message: `fetch error: ${err.message}` };
  }
}

async function main() {
  const key = process.env.SUBMIT_KEY;
  if (!key) { console.error("SUBMIT_KEY not found"); process.exit(1); }

  console.log(`Submitting ${URLS.length} WOLA-sourced articles...\n`);
  let created = 0, skipped = 0, errors = 0;

  for (const url of URLS) {
    const { created: ok, message } = await submitUrl(url, key);
    const icon = ok ? "✓" : message.includes("already exists") ? "–" : "✗";
    console.log(`${icon} ${message.padEnd(22)} ${url.slice(0, 80)}`);
    if (ok) created++;
    else if (message.includes("already exists")) skipped++;
    else errors++;
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
}

main().catch(console.error);

export {};
