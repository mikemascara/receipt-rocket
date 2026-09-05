"use client";

import { useEffect, useMemo, useState } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { matchOrdersToTransactions } from "@/lib/match";
import {
  buildMemo,
  formatDollars,
  formatYnabAmount,
  looksMaskedPayee,
  type ExtractedReceipt,
} from "@/lib/receipt";
import { getBudgetId, getYnabToken, setBudgetId } from "@/lib/storage";
import {
  daysAgoIso,
  fetchBudgets,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
  type YnabCategory,
  type YnabTransaction,
} from "@/lib/ynab";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";

type Row = {
  categoryId: string;
  suggestedReason: string;
  txId: string;
  memo: string;
  skip: boolean;
};

type Props = {
  receipt: ExtractedReceipt;
  imagePreview?: string;
  onBack: () => void;
  onSuccess: (count: number) => void;
};

export default function MatchReview({ receipt, imagePreview, onBack, onSuccess }: Props) {
  const [transactions, setTransactions] = useState<YnabTransaction[]>([]);
  const [categories, setCategories] = useState<YnabCategory[]>([]);
  const [budgetId, setBudget] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  const orders = receipt.orders;

  useEffect(() => {
    async function load() {
      const token = getYnabToken();
      if (!token) return;
      try {
        const budgets = await fetchBudgets(token);
        const saved = getBudgetId();
        const id = saved && budgets.find((b) => b.id === saved) ? saved : budgets[0]?.id;
        if (!id) throw new Error("No YNAB budget found");
        setBudget(id);
        setBudgetId(id);

        const [unapproved, recent, cats] = await Promise.all([
          fetchTransactions(token, id, { type: "unapproved" }),
          fetchTransactions(token, id, { sinceDate: daysAgoIso(21) }),
          fetchCategories(token, id),
        ]);
        setCategories(cats);

        const byId = new Map<string, YnabTransaction>();
        for (const t of [...unapproved, ...recent]) byId.set(t.id, t);
        const pool = Array.from(byId.values());
        setTransactions(pool);

        const matches = matchOrdersToTransactions(orders, pool);
        setRows(
          matches.map((m, i) => {
            const order = orders[i];
            return {
              categoryId: m.transaction?.category_id || "",
              suggestedReason: "",
              txId: m.transaction?.id || "",
              memo:
                order.memo ||
                buildMemo({ orderId: order.order_id, items: order.items }) ||
                "",
              skip: false,
            };
          })
        );
      } catch (e: any) {
        setError(e.message || "Failed to load YNAB data");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || !categories.length || !rows.length) return;
    const hasItems = orders.some((o) => o.items.length || o.memo);
    if (!hasItems) return;

    let cancelled = false;
    async function suggest() {
      setSuggesting(true);
      try {
        const res = await fetch("/api/suggest-category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categories: categories.map((c) => ({
              id: c.id,
              name: c.name,
              group: c.category_group_name,
            })),
            jobs: orders.map((o) => ({
              merchant: o.merchant,
              items: o.items.map((i) => i.name),
              memo: o.memo,
              amount: o.amount,
            })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const suggestions: any[] = data.suggestions || [];
        setRows((prev) =>
          prev.map((row, i) => {
            const s = suggestions[i];
            if (!s?.category_id || row.categoryId) return row;
            return {
              ...row,
              categoryId: s.category_id,
              suggestedReason: s.reason || "Suggested",
            };
          })
        );
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    }
    suggest();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, categories.length]);

  const txOptions: SearchOption[] = useMemo(
    () =>
      transactions.map((t) => ({
        id: t.id,
        label: `${t.payee_name && !looksMaskedPayee(t.payee_name) ? t.payee_name : "Imported"} ${formatYnabAmount(t.amount)}`,
        hint: `${t.date} · ${t.account_name}${t.approved ? "" : " · unapproved"}`,
      })),
    [transactions]
  );

  const categoryOptions: SearchOption[] = categories.map((c) => ({
    id: c.id,
    label: c.name,
    hint: c.category_group_name,
  }));

  function patchRow(i: number, next: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
  }

  const readyCount = rows.filter((r) => !r.skip && r.txId).length;

  async function handleSubmit() {
    const token = getYnabToken();
    if (!token || !budgetId) return;
    setSubmitting(true);
    setError("");

    try {
      let saved = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.skip || !row.txId) continue;
        const tx = transactions.find((t) => t.id === row.txId);
        if (!tx) continue;
        const order = orders[i];
        const payee =
          looksMaskedPayee(tx.payee_name) && order.merchant && order.merchant !== "Unknown"
            ? order.merchant
            : tx.payee_name;

        await updateTransaction(token, budgetId, tx.id, {
          account_id: tx.account_id,
          date: tx.date,
          amount: tx.amount,
          payee_name: payee,
          category_id: row.categoryId || tx.category_id,
          memo: row.memo.trim() || tx.memo,
          cleared: tx.cleared,
          approved: true,
        });
        saved += 1;
      }
      if (!saved) throw new Error("Pick a YNAB charge for at least one order");
      onSuccess(saved);
    } catch (e: any) {
      setError(e.message || "Failed to update YNAB");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold">Match to YNAB</h1>
          <p className="text-[12px] text-zinc-500">
            {orders.length} charges from screenshot
            {suggesting ? " · suggesting categories…" : ""}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {imagePreview && (
          <div className="rounded-xl overflow-hidden border border-zinc-800">
            <img
              src={imagePreview}
              alt="Screenshot"
              className="w-full max-h-36 object-contain bg-zinc-900"
            />
          </div>
        )}

        {rows.map((row, i) => {
          const order = orders[i];
          const tx = transactions.find((t) => t.id === row.txId);
          return (
            <div
              key={`${order.order_id || i}-${i}`}
              className={`rounded-2xl border px-4 py-4 space-y-3 ${
                row.skip ? "border-zinc-800 opacity-50" : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{order.merchant || "Amazon"}</p>
                  {order.order_id && (
                    <p className="text-[12px] text-zinc-500 truncate">#{order.order_id}</p>
                  )}
                  {order.items.length > 0 && (
                    <p className="text-[12px] text-zinc-400 mt-1 leading-snug">
                      {order.items.map((it) => it.name).join(", ")}
                    </p>
                  )}
                </div>
                <p className="font-semibold tabular-nums shrink-0">−{formatDollars(order.amount)}</p>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={row.skip}
                  onChange={(e) => patchRow(i, { skip: e.target.checked })}
                  className="rounded border-zinc-600 bg-zinc-900 accent-orange-500"
                />
                Skip this one
              </label>

              {!row.skip && (
                <>
                  <SearchSelect
                    label="YNAB charge"
                    options={txOptions}
                    value={row.txId}
                    onChange={(id) => patchRow(i, { txId: id })}
                    placeholder="Pick matching YNAB charge"
                    emptyOption={{ id: "", label: "— No match yet —" }}
                  />
                  {tx && (
                    <p className="text-[11px] text-zinc-500 -mt-1">
                      Keeping YNAB’s amount {formatYnabAmount(tx.amount)} on {tx.account_name}
                    </p>
                  )}

                  <SearchSelect
                    label="Category"
                    options={categoryOptions}
                    value={row.categoryId}
                    onChange={(id) => patchRow(i, { categoryId: id, suggestedReason: "" })}
                    placeholder="Choose category"
                    emptyOption={{ id: "", label: "— Keep current —" }}
                  />
                  {row.suggestedReason && (
                    <p className="text-[11px] text-orange-300/80 -mt-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {row.suggestedReason}
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Memo</label>
                    <input
                      value={row.memo}
                      onChange={(e) => patchRow(i, { memo: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 pb-6 safe-bottom">
        <button
          onClick={handleSubmit}
          disabled={submitting || readyCount === 0}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-[16px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="w-5 h-5" /> Save & approve {readyCount} in YNAB
            </>
          )}
        </button>
      </div>
    </div>
  );
}
