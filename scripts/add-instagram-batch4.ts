import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

const URLS = [
  "https://www.instagram.com/p/DVHrhOjDJIX/",
  "https://www.instagram.com/p/DWCPsUklAtT/",
  "https://www.instagram.com/p/DVl0XBXEZiW/",
  "https://www.instagram.com/p/DT0daaekb9I/",
  "https://www.instagram.com/p/DVtvkEuiPEq/",
  "https://www.instagram.com/p/DV__GdFj9Ua/",
  "https://www.instagram.com/p/DVhgxKED7Z3/",
  "https://www.instagram.com/p/DWCVemumVjY/",
  "https://www.instagram.com/p/DV_zASGAGpg/",
  "https://www.instagram.com/p/DWCJo5DkR5p/",
  "https://www.instagram.com/p/DWCssgOgf4q/",
  "https://www.instagram.com/p/DWDS8XJCiWN/",
  "https://www.instagram.com/p/DWCBvwcFNJh/",
  "https://www.instagram.com/p/DVxAgefEi7m/",
  "https://www.instagram.com/p/DV9LR8YjUyh/",
  "https://www.instagram.com/p/DVuIDlmDosT/",
  "https://www.instagram.com/p/DVL5qOgldbO/",
  "https://www.instagram.com/p/DWAUA1IjbGP/",
  "https://www.instagram.com/p/DVwFrtqmtF3/",
  "https://www.instagram.com/p/DVOW9zJlbvs/",
  "https://www.instagram.com/p/DV_vJ3Hkb-7/",
  "https://www.instagram.com/p/DV92IvgF3Gv/",
  "https://www.instagram.com/p/DVzKZGeEquE/",
  "https://www.instagram.com/p/DVJjiTCjNxX/",
  "https://www.instagram.com/p/DV1ljoTj7UJ/",
  "https://www.instagram.com/p/DV6s6oaga4J/",
  "https://www.instagram.com/p/DV6lRFjkdw6/",
  "https://www.instagram.com/p/DVRQ0MFCeFp/",
  "https://www.instagram.com/p/DV_qTPVkWUN/",
  "https://www.instagram.com/p/DVw1Jqwj-kV/",
  "https://www.instagram.com/p/DV9oX7mk3lz/",
  "https://www.instagram.com/p/DV8_NtqFPkq/",
  "https://www.instagram.com/p/DVg7mavCWma/",
  "https://www.instagram.com/p/DV3kfXLDguh/",
  "https://www.instagram.com/p/DV2HB0giX7Q/",
  "https://www.instagram.com/p/DV4Wu8CDOtX/",
  "https://www.instagram.com/p/DVtLM5VDbMZ/",
  "https://www.instagram.com/p/DV0wU3vDTbR/",
  "https://www.instagram.com/p/DVwirf6kfE1/",
  "https://www.instagram.com/p/DV3ce8zjtJP/",
  "https://www.instagram.com/p/DV1DijUjhJT/",
  "https://www.instagram.com/p/DV1A_56jt-Q/",
  "https://www.instagram.com/p/DV3fzPGkqIk/",
  "https://www.instagram.com/p/DV2JqS6kd38/",
  "https://www.instagram.com/p/DV1vGjQkZN8/",
  "https://www.instagram.com/p/DV2jQvHDddh/",
  "https://www.instagram.com/p/DV1iTDQFcgA/",
  "https://www.instagram.com/p/DV3icWgkZhl/",
  "https://www.instagram.com/p/DV2SBTGFMg1/",
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
