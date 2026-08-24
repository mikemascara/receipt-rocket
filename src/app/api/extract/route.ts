import { NextRequest, NextResponse } from "next/server";

/**
 * Receipt extraction via Grok vision.
 * Expects { image: base64String, mimeType?: string } in the body.
 * Returns { merchant, date, total, memo }
 *
 * Set XAI_API_KEY in your Vercel environment variables.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const image = body?.image;
    let mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    // xAI vision supports jpeg/jpg and png only
    if (mimeType === "image/jpg") mimeType = "image/jpeg";
    if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
      return NextResponse.json(
        {
          error:
            "Unsupported image type. Please use a JPEG or PNG photo (not HEIC). On iPhone: Settings → Camera → Formats → Most Compatible.",
        },
        { status: 400 }
      );
    }

    // Rough size guard (~15MB base64 ≈ ~11MB binary) to avoid oversized payloads
    if (image.length > 15_000_000) {
      return NextResponse.json(
        { error: "Photo is too large. Try a closer crop or lower resolution." },
        { status: 400 }
      );
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.warn("XAI_API_KEY not set — returning mock data");
      return NextResponse.json({
        merchant: "Sample Store",
        date: new Date().toISOString().slice(0, 10),
        total: 42.5,
        memo: "",
      });
    }

    const prompt = `You are a receipt parser. Extract the following from this receipt image and return ONLY valid JSON (no markdown, no explanation):

{
  "merchant": "store or restaurant name",
  "date": "YYYY-MM-DD",
  "total": 12.34,
  "memo": ""
}

Rules:
- total must be a number (the final amount paid, including tax)
- date must be ISO format YYYY-MM-DD. If unclear, use today's date
- merchant should be the clean business name only
- memo must be an empty string "". Do NOT list line items. Do NOT summarize products. Leave memo blank always.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.6",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${image}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Grok API error:", response.status, errText);

      let detail = `Vision API error (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        const msg =
          errJson?.error?.message ||
          errJson?.message ||
          errJson?.error ||
          null;
        if (typeof msg === "string" && msg.length < 200) {
          detail = msg;
        }
      } catch {
        // keep generic detail
      }

      return NextResponse.json({ error: detail }, { status: 502 });
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

    // Always blank memo unless user types one on the review screen
    return NextResponse.json({
      merchant: String(parsed.merchant || "Unknown"),
      date: String(parsed.date || new Date().toISOString().slice(0, 10)),
      total: Number(parsed.total) || 0,
      memo: "",
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
