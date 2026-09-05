"use client";

import { formatYnabAmount, looksLikeAmazon, looksMaskedPayee } from "@/lib/receipt";
import type { YnabTransaction } from "@/lib/ynab";
import { ClipboardPaste, RefreshCw } from "lucide-react";

function payeeLabel(tx: YnabTransaction): string {
  if (looksMaskedPayee(tx.payee_name)) {
    return looksLikeAmazon(tx.memo) ? "Amazon" : "Unknown payee";
  }
  return tx.payee_name || "Unknown payee";
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function InboxList({
  transactions,
  onSelect,
  onPasteAmazon,
  onRefresh,
  refreshing,
}: {
  transactions: YnabTransaction[];
  onSelect: (tx: YnabTransaction) => void;
  onPasteAmazon: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const groups: { date: string; txs: YnabTransaction[] }[] = [];
  for (const tx of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === tx.date) last.txs.push(tx);
    else groups.push({ date: tx.date, txs: [tx] });
  }

  const n = transactions.length;

  return (
    <section className="w-full mb-8">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[13px] font-medium text-orange-300">Needs review</p>
          <h2 className="text-xl font-bold tracking-tight">
            {n} to categorize
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="p-2 rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="text-[13px] text-zinc-500 mb-3 leading-snug">
        Tap a charge to categorize it. Amazon charges are faster on the Amazon tab — it reads the
        order email so you don’t have to open Amazon.
      </p>

      <button
        type="button"
        onClick={onPasteAmazon}
        className="w-full mb-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 font-medium py-3 rounded-2xl flex items-center justify-center gap-2 text-[14px]"
      >
        <ClipboardPaste className="w-4 h-4 text-orange-400" />
        Paste a receipt screenshot
      </button>

      <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/50">
        {groups.map((g) => (
          <div key={g.date}>
            <p className="px-4 pt-3 pb-1 text-[12px] font-semibold text-zinc-500">{formatDay(g.date)}</p>
            {g.txs.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelect(tx)}
                className="w-full text-left px-4 py-3 border-t border-zinc-800/80 hover:bg-zinc-800/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold truncate">{payeeLabel(tx)}</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5 truncate">
                      {tx.category_name || "Uncategorized"}
                      {tx.account_name ? ` · ${tx.account_name}` : ""}
                    </p>
                  </div>
                  <p className="text-[15px] font-semibold tabular-nums shrink-0">
                    {formatYnabAmount(tx.amount)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
