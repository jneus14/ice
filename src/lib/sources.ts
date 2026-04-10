/**
 * Hosts considered "social media" for the purposes of source classification.
 * If an incident's only sources are from these hosts, it's hidden from the
 * main feed by default.
 */
export const SOCIAL_HOSTS = new Set<string>([
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "bsky.app",
  "bsky.social",
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isSocialUrl(url: string): boolean {
  const host = hostOf(url);
  return host !== null && SOCIAL_HOSTS.has(host);
}

/**
 * True when every source URL on an incident is a social media link.
 * Used to hide such incidents from the main feed by default.
 */
export function isSocialOnly(url: string, altSources: string | null): boolean {
  const all = [url, ...parseAltSources(altSources)].filter(Boolean);
  if (all.length === 0) return false;
  return all.every(isSocialUrl);
}

/**
 * Parse the altSources DB field into an array of URLs.
 * Handles: JSON array string, legacy single URL string.
 */
export function parseAltSources(altSources: string | null): string[] {
  if (!altSources) return [];
  const trimmed = altSources.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [trimmed];
    } catch {
      return [trimmed].filter(Boolean);
    }
  }
  return [trimmed].filter(Boolean);
}

/**
 * Serialize an array of URLs into the altSources DB field format.
 */
export function serializeAltSources(urls: string[]): string | null {
  const filtered = urls.map((u) => u.trim()).filter(Boolean);
  return filtered.length > 0 ? JSON.stringify(filtered) : null;
}
