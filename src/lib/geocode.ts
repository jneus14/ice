/**
 * Parse a string date like "9/15/2025", "10/9", "2025/9/19" into a Date object.
 */
export function parseIncidentDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = dateStr.trim().replace(/\/\//g, "/");
  if (!d) return null;

  // YYYY/M/D or YYYY-M-D
  let m = d.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // M/D/YYYY
  m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  }

  // M/D/YY
  m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    const year = 2000 + Number(m[3]);
    return new Date(year, Number(m[1]) - 1, Number(m[2]));
  }

  // M/D (no year — assume current year)
  m = d.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
  }

  return null;
}

/**
 * Geocode a location string using OpenStreetMap Nominatim (free, no API key).
 * Rate limited to 1 req/sec by Nominatim policy.
 */
export async function geocodeLocation(
  location: string
): Promise<{ lat: number; lng: number } | null> {
  if (!location) return null;

  // Append "USA" if not already present to improve results
  const query = /\b(us|usa|united states)\b/i.test(location)
    ? location
    : `${location}, USA`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
    })}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "HumanImpactProject/1.0 (research)",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  } catch {
    return null;
  }
}
