import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const URLS = [
  // Sullivan's Island, SC - Sean-Michael Johnson impersonates ICE, kidnaps Latino workers (Jan 29, 2025)
  "https://abcnews4.com/news/local/huger-man-bonds-out-of-jail-after-allegedly-impersonating-ice-officer-in-viral-video-wciv-abc-news-4-2025-crime-sullivans-island-police-department-impersonating-an-immigration-and-customs-enforcement-officer-felony-kidnapping-larceny-assault-and-battery",
  // Raleigh, NC - Carl Thomas Bennett impersonates ICE, sexually assaults woman at motel (Jan 26, 2025)
  "https://abc11.com/post/raleigh-man-accused-rape-threatening-deport-victim-police-say/15844386/",
  // Temple University, Philadelphia - Students impersonate ICE on campus (Feb 1, 2025)
  "https://6abc.com/post/temple-university-student-arrested-charged-allegedly-impersonating-ice-agent-north-philadelphia/15860924/",
  // Brooklyn, NY - Leon Howell impersonates ICE, assaults/rapes woman in stairwell (Feb 2025)
  "https://www.cnn.com/2025/10/02/us/ice-impersonator-incidents-rise-invs-vis",
  // Queens, NY - NYPD Sergeant Atickul Islam impersonates ICE agent (Mar/Apr 2025)
  "https://www.amny.com/news/nypd-officer-impersonating-ice-agent-11182025/",
  // Bay County, FL - Latrance Battle impersonates ICE, kidnaps ex-boyfriend's wife (Apr 10, 2025)
  "https://www.fox35orlando.com/news/latrance-battle-florida-woman-impersonates-ice-agent-kidnaps-ex-wife-bay-county-deputies-say",
  // Huntington Park, CA - Fernando Diaz impersonates Border Patrol with gun (Jun 24, 2025)
  "https://www.nbclosangeles.com/news/local/huntington-park-accused-immigration-enforcement-agent/3734330/",
  // New York restaurant - 3 men in ICE vests rob restaurant (Aug 7, 2025)
  "https://www.newsweek.com/fbi-warns-criminals-posing-ice-robberies-kidnappings-11008376",
  // FBI warning about ICE impersonators (Oct 2025)
  "https://abc7.com/post/fbi-warns-people-impersonating-ice-agents-to-commit-violent-crimes/18123387/",
  // ICE impersonation trend overview - American Prospect (Jun 2025)
  "https://prospect.org/justice/2025-06-24-ice-impersonations-proliferate-agencys-undercover-tactics/",
  // Ms. Magazine - Men impersonating ICE to attack women (Jul 2025)
  "https://msmagazine.com/2025/07/10/men-impersonating-ice-agents-immigration-customs-attack-women-maga-trump/",
  // Philadelphia auto shop robbery - fake ICE agents (2025)
  "https://metrophiladelphia.com/northeast-philly-ice-impersonator-robbery",
  // NBC News - Men in two states accused of impersonating ICE officers
  "https://www.nbcnews.com/news/us-news/men-two-states-are-accused-impersonating-ice-officers-rcna190446",
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
      return { created: false, message: `error ${res.status}: ${JSON.stringify(data)}` };
    }
  } catch (err: any) {
    return { created: false, message: `fetch error: ${err.message}` };
  }
}

async function main() {
  const key = process.env.SUBMIT_KEY;
  if (!key) { console.error("SUBMIT_KEY not found"); process.exit(1); }

  console.log(`Submitting ${URLS.length} ICE impersonator URLs...\n`);
  let created = 0, skipped = 0, errors = 0;

  for (const url of URLS) {
    const { created: ok, message } = await submitUrl(url, key);
    const icon = ok ? "✓" : message.includes("already exists") ? "–" : "✗";
    console.log(`${icon} ${message.padEnd(20)} ${url.slice(0, 80)}...`);
    if (ok) created++;
    else if (message.includes("already exists")) skipped++;
    else errors++;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
}

main().catch(console.error);

export {};
