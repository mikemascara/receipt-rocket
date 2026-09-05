import { NextRequest, NextResponse } from "next/server";

type CategoryIn = { id: string; name: string; group?: string };
type JobIn = { merchant?: string; items?: string[]; memo?: string; amount?: number };

/**
 * Suggest YNAB categories from merchant + item names.
 * Category list is sent by the client (YNAB token never leaves the device).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const categories: CategoryIn[] = Array.isArray(body?.categories) ? body.categories : [];
    const jobs: JobIn[] = Array.isArray(body?.jobs) ? body.jobs : [];

    if (!categories.length || !jobs.length) {
      return NextResponse.json({ suggestions: jobs.map(() => null) });
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ suggestions: jobs.map(() => null) });
    }

    const categoryLines = categories
      .slice(0, 120)
      .map((c) => `- ${c.name}${c.group ? ` (${c.group})` : ""}`)
      .join("\n");

    const jobLines = jobs
      .slice(0, 20)
      .map((j, i) => {
        const items = (j.items || []).filter(Boolean).join(", ");
        return `${i + 1}. merchant=${j.merchant || "Unknown"}; amount=${j.amount ?? ""}; items=${items || "(none)"}; memo=${j.memo || ""}`;
      })
      .join("\n");

    const prompt = `Pick the best YNAB budget category for each purchase. Use ONLY names from this list:

${categoryLines}

Purchases:
${jobLines}

Return ONLY valid JSON:
{ "suggestions": [{ "category_name": "exact name from the list or null", "reason": "short" }] }

Rules:
- One suggestion per purchase, same order
- category_name must match a list name exactly (case-insensitive ok)
- If nothing fits, use null
- Prefer the most specific category
- Amazon with unknown items: null (do not default to Gifts)
- reason max 8 words`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.6",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ suggestions: jobs.map(() => null) });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return NextResponse.json({ suggestions: jobs.map(() => null) });
    }

    const raw = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const suggestions = jobs.map((_, i) => {
      const name = String(raw[i]?.category_name || "").trim();
      if (!name || name.toLowerCase() === "null") return null;
      const cat = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!cat) return null;
      return {
        category_id: cat.id,
        category_name: cat.name,
        reason: String(raw[i]?.reason || "").slice(0, 80),
      };
    });

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
