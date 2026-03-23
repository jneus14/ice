/**
 * Wayback Machine archiving utility.
 * Submits URLs to the Internet Archive for permanent preservation.
 */

const WAYBACK_SAVE_URL = "https://web.archive.org/save/";

/**
 * Submit a single URL to the Wayback Machine.
 * Returns the archived URL if successful, null otherwise.
 * This is fire-and-forget — failures are logged but don't block the pipeline.
 */
export async function archiveUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(WAYBACK_SAVE_URL + url, {
      method: "GET",
      headers: {
        "User-Agent": "HumanImpactProject/1.0 (https://hiproject.org; archival)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    // Wayback returns a redirect to the archived page
    if (res.ok || res.status === 302) {
      // The Location header or final URL contains the archive URL
      const archiveUrl = res.headers.get("content-location")
        ?? res.headers.get("location")
        ?? `https://web.archive.org/web/${new Date().toISOString().replace(/[-:T]/g, "").substring(0, 14)}/${url}`;
      console.log(`[archive] ✓ Saved: ${url}`);
      return archiveUrl;
    }

    console.warn(`[archive] ✗ Failed (${res.status}): ${url}`);
    return null;
  } catch (err: any) {
    console.warn(`[archive] ✗ Error: ${url} — ${err.message?.substring(0, 60)}`);
    return null;
  }
}

/**
 * Archive multiple URLs. Non-blocking, best-effort.
 * Adds a small delay between requests to be nice to the Wayback Machine.
 */
export async function archiveUrls(urls: string[]): Promise<void> {
  for (const url of urls) {
    // Skip social media (Instagram, TikTok etc. — Wayback can't archive these well)
    if (
      url.includes("instagram.com") ||
      url.includes("tiktok.com") ||
      url.includes("facebook.com") ||
      url.includes("threads.net")
    ) {
      continue;
    }
    await archiveUrl(url);
    // Be respectful — 1 request per 3 seconds
    await new Promise((r) => setTimeout(r, 3000));
  }
}
