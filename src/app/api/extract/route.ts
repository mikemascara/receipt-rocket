import { NextRequest, NextResponse } from "next/server";
import { buildMemo, looksLikeAmazon, nearestCalendarDate, todayIso, type ExtractedItem, type ExtractedKind, type ExtractedOrder } from "@/lib/receipt";

/**
 * Receipt / Amazon order extraction via Grok vision.
 * Expects { image: base64String, mimeType?: string } in the body.
 * Set XAI_API_KEY in your Vercel environment variables.
 */

function asItems(raw: unknown): ExtractedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i: any) => ({
      name: String(i?.name || i?.title || "").trim(),
      amount: typeof i?.amount === "number" && Number.isFinite(i.amount) ? i.amount : undefined,
    }))
    .filter((i) => i.name);
}

function asDate(raw: unknown): string {
  const s = String(raw || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return nearestCalendarDate(s);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return nearestCalendarDate(`${y}-${m}-${d}`);
  }
  return todayIso();
}

function asAmount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.abs(raw);
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const image = body?.image;
    let mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

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
        kind: "receipt",
        merchant: "Sample Store",
        date: todayIso(),
        total: 42.5,
        memo: "",
        items: [],
        orders: [
          {
            merchant: "Sample Store",
            date: todayIso(),
            amount: 42.5,
            items: [],
            memo: "",
          },
        ],
      });
    }

    const prompt = `You extract purchase details from a photo. The image may be:
- a paper/store receipt
- an Amazon order details page (items + total)
- an Amazon "Your Orders" or gift-card/wallet Transactions list (several charges)
- a confirmation email screenshot

Return ONLY valid JSON (no markdown, no explanation):

{
  "kind": "receipt" | "order_detail" | "order_list",
  "merchant": "store or Amazon",
  "date": "YYYY-MM-DD",
  "total": 12.34,
  "order_id": "optional single order id",
  "items": [{ "name": "product name", "amount": 12.34 }],
  "orders": [
    {
      "order_id": "113-1234567-1234567",
      "merchant": "Amazon" | "Amazon Marketplace",
      "date": "YYYY-MM-DD",
      "amount": 19.93,
      "status": "pending" | "completed" | "",
      "items": [{ "name": "product name", "amount": 19.93 }]
    }
  ]
}

Rules:
- amounts are positive numbers (no $ sign)
- Today's date is ${todayIso()}. date is ISO YYYY-MM-DD. If the year is missing or looks more than a year off, use the current year.
- kind=order_list when the screenshot lists MORE THAN ONE charge/order
- kind=order_detail for a single Amazon (or similar) order with line items
- kind=receipt for a paper/store receipt
- For Amazon Marketplace vs Amazon.com, set merchant to "Amazon Marketplace" or "Amazon"
- Include every visible charge as its own orders[] entry
- Put product/item names in items[] whenever they are visible
- If the screenshot only shows amounts + order numbers (no product names), still extract each order with order_id and amount, and leave items empty
- Do not invent products that are not in the image
- Ignore UI chrome (tabs, search bars, battery, nav)`;

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
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Grok API error:", response.status, errText);

      let detail = `Vision API error (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        const msg = errJson?.error?.message || errJson?.message || errJson?.error || null;
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

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse model output:", content);
      return NextResponse.json({ error: "Could not parse receipt data" }, { status: 500 });
    }

    const merchant = String(parsed.merchant || "Unknown").trim() || "Unknown";
    const date = asDate(parsed.date);
    const items = asItems(parsed.items);
    const rawOrders = Array.isArray(parsed.orders) ? parsed.orders : [];

    const orders: ExtractedOrder[] = rawOrders
      .map((o: any) => {
        const orderItems = asItems(o?.items);
        const orderId = o?.order_id ? String(o.order_id).trim() : undefined;
        const orderMerchant = String(o?.merchant || merchant).trim() || merchant;
        const orderDate = asDate(o?.date || date);
        const amount = asAmount(o?.amount);
        const kindHint = looksLikeAmazon(orderMerchant) || Boolean(orderId);
        const memo = kindHint ? buildMemo({ orderId, items: orderItems }) : "";
        return {
          order_id: orderId,
          merchant: orderMerchant,
          date: orderDate,
          amount,
          status: o?.status ? String(o.status) : undefined,
          items: orderItems,
          memo,
        };
      })
      .filter((o: ExtractedOrder) => o.amount > 0 || o.items.length > 0 || o.order_id);

    const total = asAmount(parsed.total) || orders[0]?.amount || 0;
    const singleOrderId = parsed.order_id ? String(parsed.order_id).trim() : undefined;

    let kind: ExtractedKind =
      parsed.kind === "order_list" || parsed.kind === "order_detail" || parsed.kind === "receipt"
        ? parsed.kind
        : "receipt";
    if (orders.length > 1) kind = "order_list";
    else if (kind === "receipt" && (singleOrderId || looksLikeAmazon(merchant))) kind = "order_detail";

    if (orders.length === 0) {
      const autoMemo =
        kind === "receipt" ? "" : buildMemo({ orderId: singleOrderId, items });
      orders.push({
        order_id: singleOrderId,
        merchant,
        date,
        amount: total,
        items,
        memo: autoMemo,
      });
    }

    const memo =
      kind === "receipt"
        ? ""
        : orders.length === 1
          ? orders[0].memo
          : `${orders.length} Amazon charges`;

    return NextResponse.json({
      kind,
      merchant,
      date,
      total: total || orders.reduce((s, o) => s + o.amount, 0),
      memo,
      items: items.length ? items : orders.flatMap((o) => o.items),
      orders,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
