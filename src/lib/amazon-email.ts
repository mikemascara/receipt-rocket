export type AmazonItem = {
  name: string;
  amount?: number;
};

export type AmazonOrder = {
  orderId: string;
  date: string;
  total: number;
  department: string;
  items: AmazonItem[];
  source: "email" | "csv";
  subject?: string;
};

function isoDate(raw: string | Date): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function parseDepartment(subject: string): string {
  const ordered = subject.match(/^Ordered:\s*(.+)$/i);
  const shipped = subject.match(/^(?:Shipped|Delivered):\s*(.+)$/i);
  const rest = (ordered || shipped)?.[1] || "";
  return rest
    .replace(/\s+items?$/i, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+and other$/i, "")
    .trim();
}

function extractItemsFromHtml(html: string): AmazonItem[] {
  if (!html) return [];
  const skip = /amazon|prime|logo|icon|spacer|pixel|badge|star|cart|account|orders|subscribe/i;
  const names: string[] = [];

  const alts = Array.from(html.matchAll(/alt="([^"]{8,180})"/gi));
  for (const m of alts) {
    const name = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
    if (name && !skip.test(name)) names.push(name);
  }

  const dps = Array.from(html.matchAll(/\/dp\/([A-Z0-9]{10})[^>]*>\s*([^<]{8,160})</gi));
  for (const m of dps) {
    const name = decodeEntities(m[2]).replace(/\s+/g, " ").trim();
    if (name && !skip.test(name)) names.push(name);
  }

  const unique: AmazonItem[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ name });
  }
  return unique.slice(0, 8);
}

export function parseAmazonEmail(input: {
  subject: string;
  text: string;
  html?: string;
  date?: string;
}): AmazonOrder | null {
  const subject = input.subject || "";
  if (!/ordered:/i.test(subject)) return null;

  const blob = `${input.text || ""}\n${input.html || ""}`;
  const orderMatch = blob.match(/(\d{3}-\d{7}-\d{7})/);
  const totalMatch =
    blob.match(/Grand Total:\s*([\d,.]+)\s*USD/i) ||
    blob.match(/Grand Total:[\s\S]{0,80}?([\d,.]+)\s*USD/i) ||
    blob.match(/\$([\d,]+\.\d{2})/);

  if (!orderMatch) return null;

  const total = totalMatch ? Number(String(totalMatch[1]).replace(/,/g, "")) : 0;
  const department = parseDepartment(subject);
  const htmlItems = extractItemsFromHtml(input.html || "");
  const items: AmazonItem[] = htmlItems.length
    ? htmlItems
    : department
      ? [{ name: department, amount: total || undefined }]
      : [];

  return {
    orderId: orderMatch[1],
    date: isoDate(input.date || new Date()),
    total: Number.isFinite(total) ? total : 0,
    department,
    items,
    source: "email",
    subject,
  };
}

/** Amazon "Items" order history report (CSV). */
export function parseAmazonCsv(text: string): AmazonOrder[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (row: string[], name: string) => {
    const i = header.findIndex((h) => h === name || h.includes(name));
    return i >= 0 ? row[i]?.trim() || "" : "";
  };

  const byId = new Map<string, AmazonOrder>();
  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    const orderId = col(row, "order id") || col(row, "orderid");
    if (!/^\d{3}-\d{7}-\d{7}$/.test(orderId)) continue;
    const title = col(row, "title") || col(row, "product name");
    const itemTotalRaw =
      col(row, "item total") || col(row, "item subtotal") || col(row, "purchase price");
    const itemAmount = Number(itemTotalRaw.replace(/[^0-9.]/g, "")) || undefined;
    const dateRaw = col(row, "order date") || col(row, "shipment date");
    const date = isoDate(dateRaw);
    const existing = byId.get(orderId);
    const item: AmazonItem | null = title ? { name: title, amount: itemAmount } : null;
    if (existing) {
      if (item) existing.items.push(item);
      if (itemAmount) existing.total = Number((existing.total + itemAmount).toFixed(2));
    } else {
      byId.set(orderId, {
        orderId,
        date,
        total: itemAmount || 0,
        department: col(row, "category") || "",
        items: item ? [item] : [],
        source: "csv",
      });
    }
  }
  return Array.from(byId.values());
}

export function orderMemo(order: AmazonOrder): string {
  const names = order.items.map((i) => i.name).filter(Boolean);
  const label = names.length ? names.join(", ") : order.department;
  const parts = [`#${order.orderId}`];
  if (label) parts.push(label);
  return parts.join(" · ").slice(0, 200);
}

export function mergeOrders(email: AmazonOrder[], csv: AmazonOrder[]): AmazonOrder[] {
  const byId = new Map<string, AmazonOrder>();
  for (const o of email) byId.set(o.orderId, { ...o, items: [...o.items] });
  for (const o of csv) {
    const prev = byId.get(o.orderId);
    if (!prev) {
      byId.set(o.orderId, o);
      continue;
    }
    const csvHasTitles = o.items.some((i) => i.name && i.name !== prev.department);
    if (csvHasTitles) {
      prev.items = o.items;
      prev.source = "csv";
    }
    if (o.total && !prev.total) prev.total = o.total;
  }
  return Array.from(byId.values());
}
