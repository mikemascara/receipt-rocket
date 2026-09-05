import { looksLikeAmazon, looksMaskedPayee } from "./receipt";
import type { YnabTransaction } from "./ynab";

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00`);
  const db = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 99;
  const raw = Math.round(Math.abs(da - db) / 86_400_000);
  // Same month/day with a wrong year (OCR often guesses 2024) counts as same day.
  if (a.slice(5, 10) === b.slice(5, 10)) return 0;
  return raw;
}

export function matchScore(
  tx: YnabTransaction,
  amount: number,
  date: string,
  merchant: string
): number {
  const txAmt = Math.abs(tx.amount) / 1000;
  const diff = Math.abs(txAmt - amount);
  const days = daysBetween(tx.date, date);

  let score = 0;
  if (diff === 0) score += 100;
  else if (diff <= 0.02) score += 85;
  else if (diff <= 0.5) score += 35;
  else if (diff <= 1.5) score += 8;
  else return 0;

  if (days === 0) score += 25;
  else if (days <= 2) score += 16;
  else if (days <= 5) score += 8;
  else if (days <= 10) score += 2;
  else if (days > 14) return 0;

  const payee = tx.payee_name || "";
  if (looksLikeAmazon(payee) && looksLikeAmazon(merchant)) score += 20;
  else if (
    payee &&
    merchant &&
    payee.toLowerCase().includes(merchant.toLowerCase().slice(0, 6))
  ) {
    score += 12;
  } else if (looksMaskedPayee(payee) && looksLikeAmazon(merchant)) {
    score += 6;
  }

  if (!tx.approved) score += 10;
  if (!tx.category_id) score += 4;

  return score;
}

export type MatchPair = {
  orderIndex: number;
  transaction: YnabTransaction | null;
  score: number;
};

export function matchOrdersToTransactions(
  orders: { amount: number; date: string; merchant: string }[],
  transactions: YnabTransaction[],
  minScore = 55
): MatchPair[] {
  const candidates: { orderIndex: number; tx: YnabTransaction; score: number }[] = [];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    for (const tx of transactions) {
      if (tx.deleted || tx.transfer_account_id) continue;
      const score = matchScore(tx, o.amount, o.date, o.merchant);
      if (score >= minScore) candidates.push({ orderIndex: i, tx, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const usedOrders = new Set<number>();
  const usedTx = new Set<string>();
  const byOrder = new Map<number, { transaction: YnabTransaction; score: number }>();
  for (const c of candidates) {
    if (usedOrders.has(c.orderIndex) || usedTx.has(c.tx.id)) continue;
    usedOrders.add(c.orderIndex);
    usedTx.add(c.tx.id);
    byOrder.set(c.orderIndex, { transaction: c.tx, score: c.score });
  }

  return orders.map((_, i) => {
    const hit = byOrder.get(i);
    return {
      orderIndex: i,
      transaction: hit?.transaction ?? null,
      score: hit?.score ?? 0,
    };
  });
}

export function bestMatch(
  amount: number,
  date: string,
  merchant: string,
  transactions: YnabTransaction[],
  minScore = 70
): YnabTransaction | null {
  let best: { tx: YnabTransaction; score: number } | null = null;
  const amountHits: YnabTransaction[] = [];
  for (const tx of transactions) {
    if (tx.deleted || tx.transfer_account_id) continue;
    const diff = Math.abs(Math.abs(tx.amount) / 1000 - amount);
    if (diff <= 0.02 && !tx.approved) amountHits.push(tx);
    const score = matchScore(tx, amount, date, merchant);
    if (score < minScore) continue;
    if (!best || score > best.score) best = { tx, score };
  }
  if (best) return best.tx;
  // Unique unapproved amount in the loaded window — that's the imported charge.
  if (amountHits.length === 1) return amountHits[0];
  return null;
}
