import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

// Deduplicated list of Instagram URLs to add
const URLS = [
  "https://www.instagram.com/p/DVj0-MTlEIn/",
  "https://www.instagram.com/p/DVoVQA7Eexf/",
  "https://www.instagram.com/p/DVefdMaCeOG/",
  "https://www.instagram.com/p/DVG-7FUAdl1/",
  "https://www.instagram.com/p/DVo66SpFgsS/",
  "https://www.instagram.com/p/DU7Se9RlCYX/",
  "https://www.instagram.com/p/DVkSihaDGXb/",
  "https://www.instagram.com/p/DVmBhiXFIHg/",
  "https://www.instagram.com/p/DVIV03kiONm/",
  "https://www.instagram.com/p/DVmsXvRjGXw/",
  "https://www.instagram.com/p/DVpSARZCW2w/",
  "https://www.instagram.com/p/DVowRnDD3AW/",
  "https://www.instagram.com/p/DVmdQFUjWFE/",
  "https://www.instagram.com/p/DVfd16mAgen/",
  "https://www.instagram.com/p/DVhYOtQDiKP/",
  "https://www.instagram.com/p/DVgc--RljST/",
  "https://www.instagram.com/p/DVltKy1Daxs/",
  "https://www.instagram.com/p/DUwxgGsDAsS/",
  "https://www.instagram.com/p/DVol4ftFCVK/",
  "https://www.instagram.com/p/DVe0JgVjSY5/",
  "https://www.instagram.com/p/DVltcnpjogJ/",
  "https://www.instagram.com/p/DVzLGGblc_K/",
  "https://www.instagram.com/p/DVrTsqnjxSr/",
  "https://www.instagram.com/p/DV1R8OnEZJE/",
  "https://www.instagram.com/p/DVzAkuxDRfq/",
  "https://www.instagram.com/p/DV1eUpskdJ1/",
  "https://www.instagram.com/p/DVz8uP8lqZg/",
  "https://www.instagram.com/p/DV1INtLkVMz/",
  "https://www.instagram.com/p/DVzF4R0lCH0/",
  "https://www.instagram.com/p/DVzomZNEed4/",
  "https://www.instagram.com/p/DVylLQdFImx/",
  "https://www.instagram.com/p/DVJ_xSbDcPJ/",
  "https://www.instagram.com/p/DVw3PHrEtDq/",
  "https://www.instagram.com/p/DVzAl4VkZJr/",
  "https://www.instagram.com/p/DU7EAYVEfRU/",
  "https://www.instagram.com/p/DVy_lyuiVPs/",
  "https://www.instagram.com/p/DVvlPaBE0DE/",
  "https://www.instagram.com/p/DVR1N5wCV3G/",
  "https://www.instagram.com/p/DVwthg1AWSU/",
  "https://www.instagram.com/p/DVJzVb-DQpm/",
  "https://www.instagram.com/p/DVviv9mDtKZ/",
  "https://www.instagram.com/p/DVwACadFKnU/",
  "https://www.instagram.com/p/DVuAwMCEtrr/",
  "https://www.instagram.com/p/DVwKpjKGvSk/",
  "https://www.instagram.com/p/DVv0vXpgGuA/",
  "https://www.instagram.com/p/DVtwtTWFGeS/",
  "https://www.instagram.com/p/DU67q2FgPUT/",
  "https://www.instagram.com/p/DU8s5WQmZCR/",
  "https://www.instagram.com/p/DVl3h9KEcrA/",
  "https://www.instagram.com/p/DVHQrxQElzQ/",
  "https://www.instagram.com/p/DVrgQmvknk8/",
  "https://www.instagram.com/p/DVtv-rOCU4q/",
  "https://www.instagram.com/p/DVr9FwUjKIw/",
  "https://www.instagram.com/p/DVblM85EQCQ/",
  "https://www.instagram.com/p/DVtD3PejUpx/",
  "https://www.instagram.com/p/DVbJDfRDWbI/",
  "https://www.instagram.com/p/DVgicWJkSye/",
  "https://www.instagram.com/p/DVFe_MlDZ0O/",
  "https://www.instagram.com/p/DVRz6FZklOd/",
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

  console.log(`Submitting ${URLS.length} Instagram URLs...\n`);
  let created = 0, skipped = 0, errors = 0;

  for (const url of URLS) {
    const { created: ok, message } = await submitUrl(url, key);
    const icon = ok ? "✓" : message.includes("already exists") ? "–" : "✗";
    console.log(`${icon} ${message.padEnd(20)} ${url}`);
    if (ok) created++;
    else if (message.includes("already exists")) skipped++;
    else errors++;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
}

main().catch(console.error);

export {};
