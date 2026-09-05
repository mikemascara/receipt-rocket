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
