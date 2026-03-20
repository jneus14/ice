import Anthropic from "@anthropic-ai/sdk";
import type { PageMetadata } from "./scraper";

const SYNTHESIS_PROMPT = `You are a data synthesis assistant. Given multiple news articles or sources about the same immigration enforcement incident involving the same individual, synthesize a single unified headline, summary, and timeline of key events. Return ONLY valid JSON with no markdown formatting.

{
  "headline": "A short synthesized headline summarizing the full picture of the incident (max 15 words)",
  "summary": "A 3-5 sentence factual summary synthesizing all sources, mentioning key developments or updates if the situation evolved over time",
  "timeline": [
    {"date": "M/D/YYYY", "event": "Short factual description of what happened on this date"}
  ]
}

Rules:
- The headline and summary must represent ALL sources, not just one.
- If the situation changed over time (e.g. detained → released, or appealed), reflect that arc.
- The timeline should list key events in chronological order with dates in M/D/YYYY format. Each event should be a short factual statement (e.g. "Detained by ICE agents at courthouse", "Federal judge ordered release on bond", "Released from custody"). Include 2-8 events covering the major developments.
- Remain strictly factual and neutral in tone. Describe only what happened — do not editorialize, assess significance, or use conclusory language.
- Do NOT use phrases like "became a symbol of," "drew national attention," "highlighted the human cost of," "raised questions about," or similar embellishments. Instead, describe the concrete facts: who protested, what organizations responded, what legal actions were taken.
- Do NOT characterize events as "landmark," "unprecedented," "controversial," or "sparking debate." Just state what occurred.
- Return ONLY the JSON object, no other text.`;

const EXTRACTION_PROMPT = `You are a data extraction assistant. Given the text content of a news article or social media post about a U.S. immigration enforcement incident, plus any metadata extracted from the page, extract the following fields. Return ONLY valid JSON with no markdown formatting.

{
  "headline": "A short headline summarizing the incident (max 15 words)",
  "date": "The date of the incident in M/D/YYYY format if available, otherwise null",
  "location": "City, State abbreviation (e.g. 'Chicago, IL') if available, otherwise null",
  "summary": "A 2-4 sentence factual summary of what happened",
  "incidentType": "Comma-separated tags from ONLY these options: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Process Issue, 3rd Country Deportation, Native American, Vigilante",
  "country": "Country of origin of the affected person if mentioned, otherwise null"
}

Rules:
- The page metadata (og:title, og:description, etc.) is provided by the publisher and is generally reliable for headline and summary. Use it as a strong starting point.
- Only use tags from the provided list. Use multiple comma-separated tags when applicable.
- If you cannot determine a field, set it to null.
- The summary should be strictly factual and neutral in tone. Describe only what happened — do not editorialize, assess significance, or use conclusory language.
- Do NOT use phrases like "became a symbol of," "drew national attention," "highlighted the human cost of," "raised questions about," or similar embellishments. Just state the facts.
- For the date, prefer the date the incident occurred over the article publication date. Use the publication date only as a fallback.
- Return ONLY the JSON object, no other text.`;

export type ExtractedData = {
  headline: string | null;
  date: string | null;
  location: string | null;
  summary: string | null;
  incidentType: string | null;
  country: string | null;
};

function formatMetadataContext(metadata: PageMetadata): string {
  const lines: string[] = [];
  if (metadata.title) lines.push(`Title: ${metadata.title}`);
  if (metadata.description) lines.push(`Description: ${metadata.description}`);
  if (metadata.date) lines.push(`Published: ${metadata.date}`);
  if (metadata.siteName) lines.push(`Source: ${metadata.siteName}`);
  if (metadata.author) lines.push(`Author: ${metadata.author}`);
  return lines.length > 0 ? lines.join("\n") : "No metadata available";
}

export async function extractFromText(
  bodyText: string,
  url: string,
  metadata: PageMetadata,
): Promise<ExtractedData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const anthropic = new Anthropic({ apiKey });

  const userContent = [
    `URL: ${url}`,
    ``,
    `--- Page Metadata ---`,
    formatMetadataContext(metadata),
    ``,
    `--- Article Text ---`,
    bodyText,
  ].join("\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
    system: EXTRACTION_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let jsonStr = content.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr);

  return {
    headline: parsed.headline || null,
    date: parsed.date || null,
    location: parsed.location || null,
    summary: parsed.summary || null,
    incidentType: parsed.incidentType || null,
    country: parsed.country || null,
  };
}

export type TimelineEvent = {
  date: string;
  event: string;
  source?: string;
};

export function parseTimeline(raw: string | null): TimelineEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: any) => e && typeof e.date === "string" && typeof e.event === "string"
    );
  } catch {
    return [];
  }
}

export function serializeTimeline(events: TimelineEvent[]): string | null {
  if (!events.length) return null;
  return JSON.stringify(events);
}

export async function synthesizeIncidents(
  incidents: Array<{
    url: string;
    headline: string | null;
    summary: string | null;
    date?: string | null;
  }>
): Promise<{ headline: string; summary: string; timeline: TimelineEvent[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const anthropic = new Anthropic({ apiKey });

  const content = incidents
    .map((inc, i) =>
      [
        `--- Source ${i + 1} ---`,
        `URL: ${inc.url}`,
        inc.headline ? `Headline: ${inc.headline}` : null,
        inc.date ? `Date: ${inc.date}` : null,
        inc.summary ? `Summary: ${inc.summary}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYNTHESIS_PROMPT,
    messages: [
      {
        role: "user",
        content: `Synthesize these sources about the same individual:\n\n${content}`,
      },
    ],
  });

  const responseContent = message.content[0];
  if (responseContent.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let jsonStr = responseContent.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr);

  // Parse timeline events and attach source URLs where possible
  const timeline: TimelineEvent[] = (parsed.timeline ?? [])
    .filter((e: any) => e?.date && e?.event)
    .map((e: any) => ({
      date: e.date,
      event: e.event,
      ...(e.source ? { source: e.source } : {}),
    }));

  return {
    headline: parsed.headline || "Untitled incident",
    summary: parsed.summary || "",
    timeline,
  };
}
