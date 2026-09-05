"use client";

import { useEffect, useMemo, useState } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { mergeOrders, orderMemo, parseAmazonCsv, type AmazonOrder } from "@/lib/amazon-email";
import { fetchAmazonOrdersFromGmail } from "@/lib/gmail";
import {
  loadCachedCsvOrders,
  loadCachedEmailOrders,
  saveCachedCsvOrders,
  saveCachedEmailOrders,
} from "@/lib/amazon-store";
import { matchScore } from "@/lib/match";
import { formatYnabAmount, looksLikeAmazon, looksMaskedPayee } from "@/lib/receipt";
import {
  clearGmailCredentials,
  getBudgetId,
  getGmailAppPassword,
  getGmailUser,
  getYnabToken,
  setBudgetId,
  setGmailCredentials,
} from "@/lib/storage";
import {
  fetchBudgets,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
  type YnabCategory,
  type YnabTransaction,
} from "@/lib/ynab";
import { Check, ExternalLink, FileSpreadsheet, KeyRound, Loader2, Mail, Sparkles } from "lucide-react";

type Row = {
  tx: YnabTransaction;
  orderId: string;
  categoryId: string;
  suggestedReason: string;
  skip: boolean;
};

function payeeLabel(tx: YnabTransaction): string {
  if (looksMaskedPayee(tx.payee_name)) return "Amazon";
  return tx.payee_name || "Amazon";
}

function isAmazonTx(tx: YnabTransaction): boolean {
  return looksLikeAmazon(tx.payee_name) || looksLikeAmazon(tx.memo) || looksMaskedPayee(tx.payee_name);
}

export default function AmazonScreen({ onSuccess }: { onSuccess: (count: number) => void }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [gmailReady, setGmailReady] = useState(false);
  const [orders, setOrders] = useState<AmazonOrder[]>([]);
  const [transactions, setTransactions] = useState<YnabTransaction[]>([]);
  const [categories, setCategories] = useState<YnabCategory[]>([]);
  const [budgetId, setBudget] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const user = getGmailUser() || "";
    const pass = getGmailAppPassword() || "";
    setGmailUser(user);
    setGmailPass(pass);
    setGmailReady(Boolean(user && pass));

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
        const [unapproved, cats] = await Promise.all([
          fetchTransactions(token, id, { type: "unapproved" }),
          fetchCategories(token, id),
        ]);
        const amazonTxs = unapproved.filter(isAmazonTx);
        setTransactions(amazonTxs);
        setCategories(cats);
        const merged = mergeOrders(loadCachedEmailOrders(), loadCachedCsvOrders());
        setOrders(merged);
        setRows(buildRows(amazonTxs, merged));
      } catch (e: any) {
        setError(e.message || "Failed to load YNAB");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const orderOptions: SearchOption[] = useMemo(
    () => [
      { id: "", label: "— No Amazon order —" },
      ...orders.map((o) => ({
        id: o.orderId,
        label: `${o.items[0]?.name || o.department || "Amazon"} · $${o.total.toFixed(2)}`,
        hint: `#${o.orderId} · ${o.date}`,
      })),
    ],
    [orders]
  );

  const categoryOptions: SearchOption[] = categories.map((c) => ({
    id: c.id,
    label: c.name,
    hint: c.category_group_name,
  }));

  function patch(i: number, next: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
  }

  async function syncEmails() {
    const user = gmailUser.trim();
    const pass = gmailPass.trim();
    if (!user || !pass) {
      setError("Add your Gmail address and App Password first");
      return;
    }
    setGmailCredentials(user, pass);
    setGmailReady(true);
    setSyncing(true);
    setError("");
    setStatus("Reading Amazon order emails…");
    try {
      const emailOrders = await fetchAmazonOrdersFromGmail({ user, appPassword: pass, days: 30 });
      saveCachedEmailOrders(emailOrders);
      const merged = mergeOrders(emailOrders, loadCachedCsvOrders());
      setOrders(merged);
      setRows((prev) => buildRows(prev.map((r) => r.tx), merged, prev));
      setStatus(
        emailOrders.length
          ? `Found ${emailOrders.length} Amazon orders — matched to your YNAB charges`
          : "No Amazon order emails in the last 30 days"
      );
    } catch (e: any) {
      setError(e.message || "Could not read Gmail");
    } finally {
      setSyncing(false);
    }
  }

  function onCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseAmazonCsv(String(reader.result || ""));
      saveCachedCsvOrders(parsed);
      const merged = mergeOrders(loadCachedEmailOrders(), parsed);
      setOrders(merged);
      setRows((prev) => buildRows(prev.map((r) => r.tx), merged, prev));
      setStatus(`Imported ${parsed.length} orders from CSV`);
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    if (loading || !categories.length || !rows.length) return;
    const jobs = rows.map((r) => {
      const order = orders.find((o) => o.orderId === r.orderId);
      return {
        merchant: "Amazon",
        items: order?.items.map((i) => i.name) || (order?.department ? [order.department] : []),
        memo: order ? orderMemo(order) : "",
        amount: Math.abs(r.tx.amount) / 1000,
      };
    });
    if (!jobs.some((j) => j.items.length)) return;
    let cancelled = false;
    (async () => {
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
            jobs,
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
            return { ...row, categoryId: s.category_id, suggestedReason: s.reason || "From Amazon email" };
          })
        );
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, orders.length, categories.length]);

  async function handleSubmit() {
    const token = getYnabToken();
    if (!token || !budgetId) return;
    setSubmitting(true);
    setError("");
    try {
      let saved = 0;
      for (const row of rows) {
        if (row.skip) continue;
        const order = orders.find((o) => o.orderId === row.orderId);
        const memo = order ? orderMemo(order) : row.tx.memo;
        const payee =
          looksMaskedPayee(row.tx.payee_name) || looksLikeAmazon(row.tx.payee_name)
            ? "Amazon"
            : row.tx.payee_name;
        await updateTransaction(token, budgetId, row.tx.id, {
          account_id: row.tx.account_id,
          date: row.tx.date,
          amount: row.tx.amount,
          payee_name: payee,
          category_id: row.categoryId || row.tx.category_id,
          memo,
          cleared: row.tx.cleared,
          approved: true,
        });
        saved += 1;
      }
      if (!saved) throw new Error("Nothing to save — uncheck Skip on a charge");
      onSuccess(saved);
    } catch (e: any) {
      setError(e.message || "Failed to update YNAB");
      setSubmitting(false);
    }
  }

  const ready = rows.filter((r) => !r.skip).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <h1 className="text-xl font-bold tracking-tight mb-1">Amazon</h1>
      <p className="text-[13px] text-zinc-500 leading-snug mb-4">
        Reads the Amazon order emails you already get. Matches them to the blank Amazon charges in
        YNAB. You don’t open Amazon.
      </p>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-4 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-orange-400" />
          <p className="text-[13px] font-medium text-zinc-200">Gmail (one time)</p>
        </div>
        <p className="text-[12px] text-zinc-500 leading-snug">
          Use a Gmail <span className="text-zinc-300">App Password</span>, not your normal password.
          Stored on this phone. Sent to this app only when you tap Sync, then forgotten on the server.
        </p>
        <ol className="text-[12px] text-zinc-400 space-y-1 list-decimal pl-4">
          <li>Google Account → Security → 2-Step Verification (on)</li>
          <li>
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 inline-flex items-center gap-1"
            >
              Create an App Password <ExternalLink className="w-3 h-3" />
            </a>{" "}
            named Receipt Rocket
          </li>
          <li>Paste the 16-character password below</li>
        </ol>
        <input
          type="email"
          value={gmailUser}
          onChange={(e) => setGmailUser(e.target.value)}
          placeholder="you@gmail.com"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-[14px]"
          autoComplete="username"
        />
        <input
          type="password"
          value={gmailPass}
          onChange={(e) => setGmailPass(e.target.value)}
          placeholder="Gmail App Password"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-[14px]"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={syncEmails}
          disabled={syncing}
          className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 text-[15px] disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {gmailReady ? "Find what I bought" : "Save & find what I bought"}
        </button>
        <label className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium py-3 rounded-xl flex items-center justify-center gap-2 text-[14px] cursor-pointer">
          <FileSpreadsheet className="w-4 h-4 text-orange-400" />
          Optional: Amazon order CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCsv(f);
              e.target.value = "";
            }}
          />
        </label>
        {gmailReady && (
          <button
            type="button"
            onClick={() => {
              clearGmailCredentials();
              setGmailPass("");
              setGmailReady(false);
            }}
            className="w-full text-[12px] text-zinc-500"
          >
            Disconnect Gmail
          </button>
        )}
        {status && <p className="text-[12px] text-emerald-400">{status}</p>}
      </div>

      {transactions.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">No unapproved Amazon charges in YNAB.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const order = orders.find((o) => o.orderId === row.orderId);
            return (
              <div key={row.tx.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{payeeLabel(row.tx)}</p>
                    <p className="text-[12px] text-zinc-500">
                      {row.tx.date} · {row.tx.account_name}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatYnabAmount(row.tx.amount)}</p>
                </div>

                {order ? (
                  <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-2">
                    <p className="text-[13px] text-orange-100 font-medium">
                      {order.items.map((it) => it.name).join(", ") || order.department || "Amazon order"}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      #{order.orderId} · email ${order.total.toFixed(2)}
                      {Math.abs(order.total - Math.abs(row.tx.amount) / 1000) > 0.05
                        ? " · YNAB amount differs (gift card / split is normal)"
                        : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-[12px] text-zinc-500">
                    No auto-match. Tap Sync, then pick the Amazon order.
                  </p>
                )}

                <SearchSelect
                  label="What was bought"
                  options={orderOptions}
                  value={row.orderId}
                  onChange={(id) => patch(i, { orderId: id })}
                  placeholder="Pick Amazon order"
                />

                <SearchSelect
                  label="Category"
                  options={categoryOptions}
                  value={row.categoryId}
                  onChange={(id) => patch(i, { categoryId: id, suggestedReason: "" })}
                  placeholder="Choose category"
                  emptyOption={{ id: "", label: "— Keep current —" }}
                />
                {row.suggestedReason && (
                  <p className="text-[11px] text-orange-300/80 -mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {row.suggestedReason}
                  </p>
                )}

                <label className="flex items-center gap-2 text-[13px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={row.skip}
                    onChange={(e) => patch(i, { skip: e.target.checked })}
                    className="rounded accent-orange-500"
                  />
                  Skip
                </label>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-4 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {transactions.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={submitting || ready === 0}
          className="w-full mt-5 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 text-[16px]"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Save & approve {ready} in YNAB
        </button>
      )}
    </div>
  );
}

function buildRows(txs: YnabTransaction[], orders: AmazonOrder[], prev?: Row[]): Row[] {
  const used = new Set<string>();
  return txs.map((tx) => {
    const existing = prev?.find((r) => r.tx.id === tx.id);
    let best: { order: AmazonOrder; score: number } | null = null;
    for (const o of orders) {
      if (used.has(o.orderId)) continue;
      const score = matchScore(tx, o.total, o.date, "Amazon");
      if (!best || score > best.score) best = { order: o, score };
    }
    let orderId = existing?.orderId || "";
    if (!orderId && best && best.score >= 70) {
      orderId = best.order.orderId;
      used.add(orderId);
    }
    return {
      tx,
      orderId,
      categoryId: existing?.categoryId || tx.category_id || "",
      suggestedReason: existing?.suggestedReason || "",
      skip: existing?.skip || false,
    };
  });
}
