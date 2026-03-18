import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

// Batch headline translation: [{id, headline}] → [{id, headline}]
type HeadlineItem = { id: number; headline: string | null };

// Single text translation: {text} → {text}
type TextItem = { text: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Single text mode (summary on expand)
    if (body.text !== undefined) {
      if (!body.text) return NextResponse.json({ text: "" });
      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `Translate this immigration incident summary from English to Spanish. Keep proper nouns (names, US place names, agency acronyms like ICE, CBP, DACA, TPS) unchanged. Return ONLY the translated text, no quotes, no explanation.\n\n${body.text}`,
        }],
      });
      const content = msg.content[0];
      if (content.type !== "text") throw new Error("Unexpected type");
      return NextResponse.json({ text: content.text.trim() });
    }

    // Batch headline mode
    const { incidents } = body as { incidents: HeadlineItem[] };
    if (!incidents?.length) return NextResponse.json({ translations: [] });

    const toTranslate = incidents.filter((i) => i.headline);
    if (!toTranslate.length) return NextResponse.json({ translations: incidents });

    const prompt = `Translate these immigration incident headlines from English to Spanish. Keep proper nouns (names, US place names, agency acronyms like ICE, CBP, DACA, TPS) unchanged. Return ONLY a valid JSON array with the same structure — same id values, translated headline strings.

${JSON.stringify(toTranslate)}`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = msg.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const text = content.text.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
    const translations: HeadlineItem[] = JSON.parse(text);
    return NextResponse.json({ translations });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
