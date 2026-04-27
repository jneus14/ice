import Anthropic from "@anthropic-ai/sdk";
import type { PageMetadata } from "./scraper";

const SYNTHESIS_PROMPT = `You are a data synthesis assistant. Given multiple news articles or sources about immigration enforcement incidents, verify they are about the SAME event or topic, then synthesize. Return ONLY valid JSON with no markdown formatting.

IMPORTANT: Only return mismatch if the sources are about COMPLETELY UNRELATED incidents (e.g. one is about a detention in Texas, the other about a raid in New York with no connection). Return mismatch:
{
  "mismatch": true,
  "groups": [
    {"sourceIndices": [0], "headline": "Short headline for first incident"},
    {"sourceIndices": [1, 2], "headline": "Short headline for second incident"}
  ]
}

If the sources cover the same event, policy, topic, or situation — even from different angles or mentioning different people affected by the same event — they match. Return:
{
  "headline": "A short synthesized headline summarizing the full picture of the incident (max 15 words)",
  "summary": "A 3-5 sentence factual summary (MAX 150 words) synthesizing all sources into one cohesive narrative. Do NOT repeat information from multiple sources — merge overlapping details into single statements.",
  "timeline": [
    {"date": "M/D/YYYY", "event": "Short factual description of what happened on this date", "sourceIndices": [0, 2]}
  ]
}

Rules:
- Sources match if they cover the same event, policy change, enforcement action, or topic — even if they mention different affected individuals, quote different people, or emphasize different aspects. For example, multiple articles about "LAPD policy to verify ICE identities" are the same story even if they mention different specific people.
- Only flag mismatch for truly unrelated incidents (different events in different places with no connection).
- The headline and summary must represent ALL sources, not just one.
- If the situation changed over time (e.g. detained → released, or appealed), reflect that arc.
- IMPORTANT: Each timeline event MUST include "sourceIndices" — an array of source indices (0-based) that cover/report on that specific event. This is how sources get attributed to the parts of the story they cover.
- The timeline should list key events in chronological order with dates in M/D/YYYY format. Each date should appear ONLY ONCE — if multiple things happened on the same day, synthesize them into a single concise sentence. Each event should be a short factual statement (e.g. "Detained by ICE agents at courthouse", "Federal judge ordered release on bond", "Released from custody"). Include 2-8 events covering the major developments.
- Remain strictly factual and neutral in tone. Describe only what happened — do not editorialize, assess significance, or use conclusory language.
- Do NOT use phrases like "became a symbol of," "drew national attention," "highlighted the human cost of," "raised questions about," or similar embellishments. Instead, describe the concrete facts: who protested, what organizations responded, what legal actions were taken.
- Do NOT characterize events as "landmark," "unprecedented," "controversial," or "sparking debate." Just state what occurred.
- Return ONLY the JSON object, no other text.`;

const EXTRACTION_PROMPT = `You are a data extraction assistant. Given the text content of a news article or social media post about a U.S. immigration enforcement incident, plus any metadata extracted from the page, extract the following fields. Return ONLY valid JSON with no markdown formatting.

{
  "headline": "A short headline summarizing the incident (max 15 words)",
  "date": "The date of the incident in M/D/YYYY format if available, otherwise null",
  "location": "City, State abbreviation (e.g. 'St. Paul, MN' or 'Chicago, IL'). MUST be the specific city/town name, NEVER use the full state name (e.g. 'Minnesota, MN' is WRONG). If no specific city is mentioned, use the county or region. If only a state is known, use just the state abbreviation (e.g. 'TX'). Null if unavailable.",
  "summary": "A 2-4 sentence factual summary of what happened",
  "incidentType": "Comma-separated tags from ONLY these options. INCIDENT TYPE: Detained, Deported, Death, Detention Conditions, Officer Use Of Force, Officer Misconduct, Policy/Stats, Minor/Family, U.S. Citizen, Protest / Intervention, Raid, Resistance, Resources, Refugee/Asylum, DACA, Visa / Legal Status, LPR, TPS, Court Order Violation, Litigation, 3rd Country Deportation, Native American, Indigenous (Non-U.S.), Black, Vigilante, Disappearance/Detention, Military. ENFORCEMENT SETTING (where the enforcement action took place, if mentioned): Court/USCIS/Immigration Office, Airport, Vehicle/Traffic Stop, Workplace, School, Church/Place of Worship, Hospital/Medical, Home/Residence, Criminal/Detainer, Public Space/Street",
  "country": "Country of origin of the affected person if mentioned, otherwise null"
}

Rules:
- IMPORTANT: This tracker is primarily for news stories about specific immigration enforcement incidents. If the article is a general explainer or academic paper unrelated to enforcement, return ALL fields as null. However, if the article is legal advice, a know-your-rights guide, a resource page, or a toolkit for immigrants, tag it as "Resources" and extract what you can.
- The page metadata (og:title, og:description, etc.) is provided by the publisher and is generally reliable for headline and summary. Use it as a strong starting point.
- Only use tags from the provided list. Use multiple comma-separated tags when applicable.
- TAG DEFINITIONS — apply tags precisely:
  - "Raid": ONLY for enforcement operations where officers storm/sweep a location and detain multiple people (workplace raids, neighborhood sweeps, multi-person operations). Do NOT use for targeted arrests of a single individual or for stories about planned detention facilities.
  - "Policy": for stories about immigration policy developments, legislative or executive action, lawsuits brought by or against the government, and structural changes to enforcement. Examples: "Minnesota sues federal government over ICE cooperation", "Trump administration expands detention capacity", "DHS issues new enforcement directive", "Court rules on sanctuary city ordinance". Use when the story's focus is a policy, law, or governmental action — not a specific individual's incident.
  - "Analysis": for stories driven by statistics, aggregate data, or trend reporting. Examples: "ICE arrests exceed 1,000 daily", "Deportation flights increase 40%", "Detention numbers in Texas reach new high", analytical pieces examining enforcement patterns across regions or time periods. Use when the story's focus is data or trends rather than a specific person's incident. A story can be both Policy and Analysis when a policy development is framed around data (e.g. a lawsuit citing detention statistics).
  - "Detained" / "Disappearance/Detention": ONLY when a specific, named or identified person is actually detained, disappeared, or held in custody in the story. Do NOT use for stories about aggregate arrest/detention statistics, general policy, planned facilities, or protests about detention. If the story is about overall enforcement numbers, use "Analysis"; if about policy trends, use "Policy".
  - "Deported": ONLY when a specific, named or identified person is actually deported or removed from the country in the story. Do NOT use for stories about aggregate deportation statistics, deportation policy changes, or general deportation trends. If the story is about overall deportation numbers, use "Analysis"; if about policy, use "Policy".
  - "Resistance": for vigils, protests, rallies, community organizing, sanctuary movements, activist stories, community opposition to ICE facilities/operations, and cases where activists or advocates are targeted by ICE.
  - "Resources": for legal guides, know-your-rights information, toolkits for immigrants, legal resource directories, how-to guides for dealing with ICE encounters, immigration legal aid information, and similar practical resources. These are NOT news stories about specific incidents.
  - "Native American": ONLY for U.S. Native Americans (members of federally recognized tribes, e.g. Navajo, Oglala Sioux, Cherokee).
  - "Indigenous (Non-U.S.)": for indigenous people from other countries (e.g. indigenous Mexicans, Guatemalan Mayans, etc.).
  - "Black": for people described as Black, Afro-descended (Afro-Latino, Afro-Caribbean, Afro-Cuban, etc.), African American, or whose country of origin is in Africa. Apply alongside other tags as appropriate (e.g. a Black asylum seeker from Cameroon would get both "Black" and "Refugee/Asylum"). Do NOT apply based on incidental mentions of the word "black" unrelated to a person's identity (e.g. "black SUV", "blackout").
  - "Visa / Legal Status": ONLY for people who had a VALID, current visa or legal status at the time they were detained/deported (e.g. valid work visa, valid student visa, valid tourist visa, green card holders with valid status). Do NOT use for people who overstayed their visa, had expired status, or were undocumented. Overstaying a visa means they NO LONGER have valid status. Use "LPR" instead for lawful permanent residents (green card holders).
  - "Court Order Violation": ONLY when the federal government (Trump administration, ICE, CBP, DOJ, etc.) defies, ignores, or violates a court order — e.g. deporting someone despite a judge's stay, refusing to comply with an injunction, or continuing a practice a court has ordered stopped. Do NOT use when a court merely issues an order, when someone is released or protected because of a court order, or when the government complies with a court ruling. The violation must be by the government, not by a private party. Use alongside other tags as appropriate.
  - "Litigation": for stories that mention decisions, rulings, or orders by judges in U.S. courts related to immigration enforcement — e.g. a judge ordering someone's release, blocking a deportation, ruling on detention conditions, issuing injunctions against ICE, or ruling on constitutional challenges to enforcement actions. Use alongside other tags as appropriate.
  - "Vigilante": ONLY for non-government actors — civilians impersonating ICE agents, bounty hunters, or vigilantes targeting immigrants. Do NOT use for real ICE/CBP agents using deceptive tactics (false pretenses, unmarked vehicles, fake stories) — those are "Officer Misconduct".
- ENFORCEMENT SETTING — ALWAYS include an enforcement setting tag if the location of the arrest/detention is mentioned. Apply based on WHERE the person was physically taken into custody (the "first instance" of enforcement):
  - "Court/USCIS/Immigration Office": arrested at immigration court, ICE check-in/appointment, USCIS interview, courthouse, or field office. Includes arrests at scheduled check-ins, interviews, hearings, or in the courthouse/office lobby or parking lot.
  - "Airport": arrested at or entering/exiting an airport.
  - "Vehicle/Traffic Stop": arrested during or as result of a traffic stop, pulled over while driving.
  - "Workplace": arrested at job site, restaurant where they work, construction site, farm, Home Depot pickup spot, etc.
  - "School": arrested at or outside a school, daycare, university.
  - "Church/Place of Worship": arrested at a church, mosque, synagogue, religious institution.
  - "Hospital/Medical": arrested AT a hospital, clinic, or medical facility (or just outside entering/exiting). Do NOT use when person is merely hospitalized AFTER arrest or dies in hospital after detention.
  - "Home/Residence": arrested at their home, apartment, or residence.
  - "Criminal/Detainer": transferred to ICE from local jail/prison, taken into custody via criminal detainer after serving sentence or during criminal proceedings.
  - "Public Space/Street": arrested on street, sidewalk, parking lot (not workplace/medical/etc.), in public park, store, or other general public location. Use this as the default public-location setting when none of the more specific settings apply.
  - You may include MULTIPLE enforcement settings if applicable (e.g. "Vehicle/Traffic Stop, Criminal/Detainer" if pulled over then transferred from jail).
- If you cannot determine a field, set it to null.
- The summary should be strictly factual and neutral in tone. Describe only what happened — do not editorialize, assess significance, or use conclusory language.
- Do NOT use phrases like "became a symbol of," "drew national attention," "highlighted the human cost of," "raised questions about," or similar embellishments. Just state the facts.
- LANGUAGE: Never use the word "illegal" to describe people or border crossings. Use "unauthorized entry" instead of "illegal entry/crossing." Use "undocumented" instead of "illegal immigrant/alien." The word "illegal" is fine when describing government actions (e.g. "illegally detained").
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

  const incidentType = inferEnforcementSetting(
    parsed.incidentType || null,
    parsed.summary || null,
    parsed.headline || null,
  );

  return {
    headline: parsed.headline || null,
    date: parsed.date || null,
    location: parsed.location || null,
    summary: parsed.summary || null,
    incidentType,
    country: parsed.country || null,
  };
}

const ENFORCEMENT_SETTINGS = [
  "Court/USCIS/Immigration Office",
  "Airport",
  "Vehicle/Traffic Stop",
  "Workplace",
  "School",
  "Church/Place of Worship",
  "Hospital/Medical",
  "Home/Residence",
  "Criminal/Detainer",
  "Public Space/Street",
];

/**
 * If the AI didn't apply any enforcement setting but the summary clearly
 * describes one, infer it from keywords. Safety net only — the prompt
 * remains primary.
 */
function inferEnforcementSetting(
  incidentType: string | null,
  summary: string | null,
  headline: string | null,
): string | null {
  if (!incidentType) return incidentType;
  const existing = incidentType.split(",").map((t) => t.trim());
  const hasAnySetting = existing.some((t) => ENFORCEMENT_SETTINGS.includes(t));
  if (hasAnySetting) return incidentType;

  const text = `${headline || ""} ${summary || ""}`.toLowerCase();
  if (!text.trim()) return incidentType;

  const rules: Array<[string, RegExp]> = [
    ["Court/USCIS/Immigration Office", /\b(check[- ]?in|routine check|scheduled check|field office|immigration court(?:house)?|uscis|ice office|immigration office|immigration interview|asylum interview|court hearing|scheduled (?:interview|appointment)|i-130|naturalization interview)\b/],
    ["Airport", /\b(airport|customs|lax|jfk|ohare|o'hare|dulles|miami international|cbp (?:at|arriving))\b/],
    ["Hospital/Medical", /\b(hospital|emergency room|urgent care|clinic|medical center|health (?:department|clinic|center)|prenatal appointment|doctor(?:'s)? office)\b/],
    ["School", /\b(school|classroom|university|college campus|daycare|preschool)\b/],
    ["Church/Place of Worship", /\b(church|mosque|synagogue|temple|place of worship|religious service)\b/],
    ["Workplace", /\b(workplace|job site|jobsite|restaurant where|construction site|home depot|farm|factory|warehouse|while (?:at |working)|left for work|leaving (?:for |his |her )?work|car wash|landscap|while working)\b/],
    ["Home/Residence", /\b(at (?:his|her|their) home|at the home|at (?:his|her|their) (?:apartment|residence|house)|home raid|at (?:his|her|their) door|front door|knocked on the door)\b/],
    ["Vehicle/Traffic Stop", /\b(traffic stop|pulled over|while driving|in (?:his|her|their) (?:car|vehicle|truck)|traffic violation|police stop)\b/],
    ["Criminal/Detainer", /\b(ice detainer|criminal detainer|transferred (?:from|to) (?:jail|prison|custody)|released from jail|after serving|after (?:his|her|their) sentence|while in (?:jail|prison|custody)|picked up from jail)\b/],
  ];

  const inferred: string[] = [];
  for (const [setting, pattern] of rules) {
    if (pattern.test(text)) {
      inferred.push(setting);
    }
  }

  if (inferred.length === 0) return incidentType;
  return [...existing, ...inferred].join(", ");
}

export type TimelineEvent = {
  date: string;
  event: string;
  source?: string;
  sources?: string[];
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

export type SynthesisResult =
  | { mismatch: false; headline: string; summary: string; timeline: TimelineEvent[] }
  | { mismatch: true; groups: Array<{ sourceIndices: number[]; headline: string }> };

export async function synthesizeIncidents(
  incidents: Array<{
    url: string;
    headline: string | null;
    summary: string | null;
    date?: string | null;
  }>
): Promise<{ headline: string; summary: string; timeline: TimelineEvent[] }> {
  const result = await synthesizeIncidentsWithMismatchDetection(incidents);
  if (result.mismatch) {
    // Fallback: use only the first source group
    throw new MismatchError("Sources describe different incidents", result.groups);
  }
  return { headline: result.headline, summary: result.summary, timeline: result.timeline };
}

export class MismatchError extends Error {
  groups: Array<{ sourceIndices: number[]; headline: string }>;
  constructor(message: string, groups: Array<{ sourceIndices: number[]; headline: string }>) {
    super(message);
    this.name = "MismatchError";
    this.groups = groups;
  }
}

export async function synthesizeIncidentsWithMismatchDetection(
  incidents: Array<{
    url: string;
    headline: string | null;
    summary: string | null;
    date?: string | null;
  }>
): Promise<SynthesisResult> {
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

  const message = await anthropic.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYNTHESIS_PROMPT,
      messages: [
        {
          role: "user",
          content: `Verify these sources are about the same incident, then synthesize if they are:\n\n${content}`,
        },
      ],
    },
    { timeout: 20000 },
  );

  const responseContent = message.content[0];
  if (responseContent.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let jsonStr = responseContent.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr);

  // Check for mismatch
  if (parsed.mismatch) {
    return {
      mismatch: true,
      groups: parsed.groups ?? [],
    };
  }

  // Parse timeline events, converting sourceIndices to actual URLs
  const timeline: TimelineEvent[] = (parsed.timeline ?? [])
    .filter((e: any) => e?.date && e?.event)
    .map((e: any) => {
      const sources: string[] = [];
      // Convert sourceIndices to URLs
      if (Array.isArray(e.sourceIndices)) {
        for (const idx of e.sourceIndices) {
          if (typeof idx === "number" && incidents[idx]?.url) {
            sources.push(incidents[idx].url);
          }
        }
      }
      // Also support legacy source/sources fields
      if (e.source && typeof e.source === "string") sources.push(e.source);
      if (Array.isArray(e.sources)) sources.push(...e.sources.filter((s: any) => typeof s === "string"));

      return {
        date: e.date,
        event: e.event,
        ...(sources.length > 0 ? { sources: [...new Set(sources)] } : {}),
      };
    });

  return {
    mismatch: false,
    headline: parsed.headline || "Untitled incident",
    summary: parsed.summary || "",
    timeline,
  };
}
