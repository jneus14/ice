import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAltSources } from "@/lib/sources";
import { scrapeUrl } from "@/lib/scraper";
import Anthropic from "@anthropic-ai/sdk";

const EDIT_PASSWORD = "acab";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("x-edit-password") !== EDIT_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { url: true, altSources: true, headline: true, summary: true, date: true, location: true },
  });

  if (!incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Gather source content for richer details
  const altUrls = parseAltSources(incident.altSources);
  const urls = [incident.url, ...altUrls].filter(
    u => !u.includes("instagram.com") && !u.includes("tiktok.com") && !u.includes(".pdf")
  ).slice(0, 5);

  const sourceTexts: string[] = [];
  for (const url of urls) {
    try {
      const { bodyText } = await scrapeUrl(url);
      if (bodyText) sourceTexts.push(bodyText.slice(0, 2000));
    } catch {
      // skip
    }
  }

  // Also include the existing summary
  const allContent = [
    incident.summary ? `Existing summary: ${incident.summary}` : "",
    ...sourceTexts.map((t, i) => `Source ${i + 1}:\n${t}`),
  ].filter(Boolean).join("\n\n---\n\n");

  const anthropic = new Anthropic({ apiKey });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Return a JSON object with two fields. No markdown, no code fences — ONLY the raw JSON object.

{
  "name": "Full name of the person",
  "description": "3-4 sentence poster description"
}

Write the description for a "DISAPPEARED FROM OUR COMMUNITY" advocacy poster.

PRIORITIZE these humanizing details (include ALL that you can find):
- Family relationships: children (especially U.S. citizen children), spouse, parents
- Years living in the U.S.
- Job, career, business, or role in community
- Age
- Legal status details (DACA, green card holder, TPS, asylum seeker, etc.)
- What happened: when and how they were taken

Write in third person. Be STRICTLY FACTUAL — state only what happened. Do NOT editorialize, assess impact, or draw conclusions. Do NOT include sentences like "his story shattered...", "sparked awareness...", "raised questions...", "highlighted the human cost...", or any assessment of broader significance. Just state the facts about the person and what happened to them. Start with their name. Do NOT use markdown formatting — plain text only.

Example: "Jorge Cruz, a father of four, came to the U.S. from Mexico City at age 5. A green card holder married to a U.S. citizen since 2014, he built a thriving food cart business with 25 carts. On August 27, 2025, ICE agents arrested him as he and his wife returned from dropping their children off at school."

Content from sources:
${allContent.slice(0, 6000)}`,
    }],
  });

  const rawText = message.content[0];
  if (rawText.type !== "text") {
    return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
  }

  // Try to parse as JSON
  let name: string | null = null;
  let description: string;

  try {
    let jsonStr = rawText.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(jsonStr);
    name = parsed.name ?? null;
    description = parsed.description ?? "";
  } catch {
    // Fallback: use raw text as description
    description = rawText.text;
  }

  // Strip any remaining markdown
  description = description
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^[-•]\s*/gm, "")
    .replace(/\n+/g, " ")
    .trim();

  return NextResponse.json({ description, name });
}
