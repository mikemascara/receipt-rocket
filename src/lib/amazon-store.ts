import type { AmazonOrder } from "./amazon-email";

const EMAIL_KEY = "receipt-rocket-amazon-orders";
const CSV_KEY = "receipt-rocket-amazon-csv-orders";

export function loadCachedEmailOrders(): AmazonOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EMAIL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCachedEmailOrders(orders: AmazonOrder[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMAIL_KEY, JSON.stringify(orders.slice(0, 200)));
}

export function loadCachedCsvOrders(): AmazonOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CSV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCachedCsvOrders(orders: AmazonOrder[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CSV_KEY, JSON.stringify(orders.slice(0, 500)));
}
