import { NextRequest, NextResponse } from "next/server";

/**
 * Receipt extraction via Grok vision.
 * Expects { image: base64String } in the body.
 * Returns { merchant, date, total, memo }
 *
 * Set XAI_API_KEY in your Vercel environment variables.
 */
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.warn("XAI_API_KEY not set — returning mock data");
      return NextResponse.json({
        merchant: "Sample Store",
        date: new Date().toISOString().slice(0, 10),
        total: 42.5,
        memo: "Mock extraction (set XAI_API_KEY)",
      });
    }

    const prompt = `You are a receipt parser. Extract the following from this receipt image and return ONLY valid JSON (no markdown, no explanation):

{
  "merchant": "store or restaurant name",
  "date": "YYYY-MM-DD",
  "total": 12.34,
  "memo": "optional short note"
}

Rules:
- total must be a number (the final amount paid, including tax)
- date should be ISO format. If unclear, use today's date
- merchant should be the clean business name
- If you cannot determine a field, use reasonable defaults`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Grok API error:", response.status, errText);
      return NextResponse.json(
        { error: `Vision API error (${response.status})` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse model output:", content);
      return NextResponse.json(
        { error: "Could not parse receipt data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      merchant: String(parsed.merchant || "Unknown"),
      date: String(parsed.date || new Date().toISOString().slice(0, 10)),
      total: Number(parsed.total) || 0,
      memo: parsed.memo ? String(parsed.memo) : "",
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
