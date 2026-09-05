export type ExtractedItem = {
  name: string;
  amount?: number;
};

export type ExtractedOrder = {
  order_id?: string;
  merchant: string;
  date: string;
  amount: number;
  status?: string;
  items: ExtractedItem[];
  memo: string;
};

export type ExtractedKind = "receipt" | "order_list" | "order_detail";

export type ExtractedReceipt = {
  kind: ExtractedKind;
  merchant: string;
  date: string;
  total: number;
  memo: string;
  items: ExtractedItem[];
  orders: ExtractedOrder[];
};

const MEMO_MAX = 200;

export function looksMaskedPayee(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  return /^[\s*•·.─\-]+$/.test(trimmed);
}

export function looksLikeAmazon(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(amazon|amzn|amzn\.com|amazon\.com|amzn mktp)\b/i.test(text);
}

export function buildMemo(opts: {
  orderId?: string;
  items?: ExtractedItem[];
  extra?: string;
}): string {
  const parts: string[] = [];
  if (opts.orderId) {
    const id = String(opts.orderId).replace(/^#/, "").trim();
    if (id) parts.push(`#${id}`);
  }
  const names = (opts.items || []).map((i) => i.name?.trim()).filter(Boolean);
  if (names.length) parts.push(names.join(", "));
  if (opts.extra?.trim()) parts.push(opts.extra.trim());
  let memo = parts.join(" · ");
  if (memo.length > MEMO_MAX) memo = `${memo.slice(0, MEMO_MAX - 1).trimEnd()}…`;
  return memo;
}

export function formatYnabAmount(milli: number): string {
  const dollars = milli / 1000;
  const abs = Math.abs(dollars).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
  if (dollars < 0) return `−${abs}`;
  if (dollars > 0) return `+${abs}`;
  return abs;
}

export function formatDollars(dollars: number): string {
  return Math.abs(dollars).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

export function todayIso(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Prefer a date close to today when the year is missing or obviously wrong (e.g. 2024-09-05 in 2026). */
export function nearestCalendarDate(raw: string, today = todayIso()): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  if (!iso) return today;
  const mm = iso.slice(5, 7);
  const dd = iso.slice(8, 10);
  const year = Number(today.slice(0, 4));
  const candidates = [iso, `${year}-${mm}-${dd}`, `${year - 1}-${mm}-${dd}`];
  const todayMs = Date.parse(`${today}T00:00:00`);
  let best = today;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const ms = Date.parse(`${c}T00:00:00`);
    if (Number.isNaN(ms)) continue;
    const diff = Math.abs(ms - todayMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

export function receiptFromTransaction(input: {
  payeeName: string | null;
  date: string;
  amountMilli: number;
  memo: string | null;
}): ExtractedReceipt {
  const amazon = looksLikeAmazon(input.payeeName);
  const merchant = looksMaskedPayee(input.payeeName)
    ? amazon
      ? "Amazon"
      : ""
    : (input.payeeName || "").trim();
  const amount = Math.abs(input.amountMilli) / 1000;
  const memo = input.memo || "";
  return {
    kind: "receipt",
    merchant: merchant || "Unknown",
    date: input.date,
    total: amount,
    memo,
    items: [],
    orders: [
      {
        merchant: merchant || "Unknown",
        date: input.date,
        amount,
        items: [],
        memo,
      },
    ],
  };
}
