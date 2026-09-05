"use client";

import { useEffect, useRef, useState } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { bestMatch } from "@/lib/match";
import {
  buildMemo,
  formatYnabAmount,
  looksMaskedPayee,
  nearestCalendarDate,
  type ExtractedReceipt,
} from "@/lib/receipt";
import { getBudgetId, getLastAccountId, getYnabToken, setBudgetId, setLastAccountId } from "@/lib/storage";
import {
  createTransaction,
  daysAgoIso,
  fetchAccounts,
  fetchBudgets,
  fetchCategories,
  fetchTransactions,
  toMilliunits,
  updateTransaction,
  type YnabAccount,
  type YnabBudget,
  type YnabCategory,
  type YnabTransaction,
} from "@/lib/ynab";
import { ArrowLeft, Calendar, Check, Loader2, Minus, Plus, Sparkles } from "lucide-react";

export type { ExtractedReceipt };

type Props = {
  receipt: ExtractedReceipt;
  imagePreview?: string;
  existingTransaction?: YnabTransaction | null;
  onBack: () => void;
  onSuccess: (mode: "updated" | "created") => void;
  onAttachImage?: () => void;
};

function toDateValue(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return nearestCalendarDate(raw);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return nearestCalendarDate(`${y}-${m}-${d}`);
  }
  return nearestCalendarDate("");
}

function formatDateLabel(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value || "Pick a date";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DateField({
  value,
  onChange,
  locked,
}: {
  value: string;
  onChange: (next: string) => void;
  locked?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (locked) return;
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      // fall through to click/focus
    }
    el.click();
    el.focus();
  }

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Date</label>
      {locked ? (
        <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-[15px] text-zinc-300">
          {formatDateLabel(value)}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl">
          <button
            type="button"
            onClick={openPicker}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          >
            <span className="text-zinc-100 truncate">{formatDateLabel(value)}</span>
            <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
          </button>
          <input
            ref={inputRef}
            type="date"
            value={value}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Choose date"
          />
        </div>
      )}
    </div>
  );
}

function preferredAccountId(accounts: { id: string }[]): string {
  const last = getLastAccountId();
  if (last && accounts.some((a) => a.id === last)) return last;
  return accounts[0]?.id || "";
}

export default function ReviewScreen({
  receipt,
  imagePreview,
  existingTransaction,
  onBack,
  onSuccess,
  onAttachImage,
}: Props) {
  const order = receipt.orders[0];
  const initialMemo =
    receipt.kind === "receipt"
      ? ""
      : receipt.memo ||
        buildMemo({ orderId: order?.order_id, items: receipt.items || order?.items });

  const [merchant, setMerchant] = useState(receipt.merchant);
  const [date, setDate] = useState(() => toDateValue(receipt.date));
  const [amount, setAmount] = useState(receipt.total.toFixed(2));
  const [isDeposit, setIsDeposit] = useState(false);
  const [memo, setMemo] = useState(initialMemo);

  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const [categories, setCategories] = useState<YnabCategory[]>([]);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [suggestedReason, setSuggestedReason] = useState("");

  const [matchedTx, setMatchedTx] = useState<YnabTransaction | null>(existingTransaction || null);
  const [forceCreate, setForceCreate] = useState(false);
  const [ynabTxs, setYnabTxs] = useState<YnabTransaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updating = Boolean(matchedTx) && !forceCreate;

  useEffect(() => {
    async function load() {
      const token = getYnabToken();
      if (!token) return;

      try {
        const b = await fetchBudgets(token);
        setBudgets(b);

        const savedBudget = getBudgetId();
        const budgetId =
          savedBudget && b.find((x) => x.id === savedBudget) ? savedBudget : b[0]?.id;
        if (budgetId) {
          setSelectedBudget(budgetId);
          setBudgetId(budgetId);
          const [accts, cats, unapproved, recent] = await Promise.all([
            fetchAccounts(token, budgetId),
            fetchCategories(token, budgetId),
            fetchTransactions(token, budgetId, { type: "unapproved" }),
            fetchTransactions(token, budgetId, { sinceDate: daysAgoIso(21) }),
          ]);
          setAccounts(accts);
          setCategories(cats);
          const byId = new Map<string, YnabTransaction>();
          for (const t of [...unapproved, ...recent]) byId.set(t.id, t);
          setYnabTxs(Array.from(byId.values()));
          if (existingTransaction) {
            setSelectedAccount(existingTransaction.account_id);
            setSelectedCategory(existingTransaction.category_id || "");
            setDate(existingTransaction.date);
            setAmount((Math.abs(existingTransaction.amount) / 1000).toFixed(2));
            if (looksMaskedPayee(existingTransaction.payee_name) && receipt.merchant !== "Unknown") {
              setMerchant(receipt.merchant);
            } else if (existingTransaction.payee_name && looksMaskedPayee(receipt.merchant)) {
              setMerchant(existingTransaction.payee_name);
            }
          } else if (accts.length) {
            setSelectedAccount(preferredAccountId(accts));
          }
        }
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
    if (loading || existingTransaction || forceCreate || !ynabTxs.length) return;
    const dollars = parseFloat(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    const hit = bestMatch(dollars, date, merchant, ynabTxs);
    if (hit) {
      setMatchedTx(hit);
      setSelectedAccount(hit.account_id);
      setLastAccountId(hit.account_id);
      if (hit.category_id) {
        setSelectedCategory((prev) => prev || hit.category_id || "");
      }
    } else {
      setMatchedTx(null);
    }
  }, [loading, amount, date, merchant, ynabTxs, forceCreate, existingTransaction]);

  useEffect(() => {
    const items = (receipt.items || []).map((i) => i.name).filter(Boolean);
    if (loading || !categories.length) return;
    if (!items.length && receipt.kind === "receipt") return;
    if (selectedCategory && existingTransaction) return;

    let cancelled = false;
    async function suggest() {
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
            jobs: [
              {
                merchant,
                items,
                memo,
                amount: parseFloat(amount),
              },
            ],
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const s = data.suggestions?.[0];
        if (cancelled || !s?.category_id) return;
        setSelectedCategory((prev) => prev || s.category_id);
        setSuggestedReason(s.reason || "Suggested from items");
      } catch {
        // non-fatal
      }
    }
    suggest();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, categories.length]);

  async function handleBudgetChange(id: string) {
    setSelectedBudget(id);
    setBudgetId(id);
    setSelectedAccount("");
    setSelectedCategory("");
    const token = getYnabToken();
    if (!token) return;
    try {
      const [accts, cats] = await Promise.all([
        fetchAccounts(token, id),
        fetchCategories(token, id),
      ]);
      setAccounts(accts);
      setCategories(cats);
      if (accts.length) setSelectedAccount(preferredAccountId(accts));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleSubmit() {
    const token = getYnabToken();
    if (!token || !selectedBudget) return;

    setSubmitting(true);
    setError("");

    try {
      const dollars = parseFloat(amount);
      if (isNaN(dollars) || dollars <= 0) throw new Error("Enter a valid amount");

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Pick a date from the calendar");
      }

      if (updating && matchedTx) {
        const payee =
          merchant && merchant !== "Unknown"
            ? merchant
            : looksMaskedPayee(matchedTx.payee_name)
              ? merchant
              : matchedTx.payee_name;
        await updateTransaction(token, selectedBudget, matchedTx.id, {
          account_id: matchedTx.account_id,
          date: matchedTx.date,
          amount: matchedTx.amount,
          payee_name: payee || matchedTx.payee_name,
          category_id: selectedCategory || matchedTx.category_id,
          memo: memo.trim() || matchedTx.memo,
          cleared: matchedTx.cleared,
          approved: true,
        });
        setLastAccountId(matchedTx.account_id);
        onSuccess("updated");
        return;
      }

      if (!selectedAccount) throw new Error("Choose an account");

      await createTransaction(token, selectedBudget, {
        account_id: selectedAccount,
        date,
        amount: toMilliunits(isDeposit ? dollars : -dollars),
        payee_name: merchant || undefined,
        category_id: selectedCategory || undefined,
        memo: memo.trim() || undefined,
        cleared: "uncleared",
        approved: true,
      });

      setLastAccountId(selectedAccount);
      onSuccess("created");
    } catch (e: any) {
      setError(e.message || "Failed to save transaction");
      setSubmitting(false);
    }
  }

  const accountOptions: SearchOption[] = accounts.map((a) => ({
    id: a.id,
    label: a.name,
  }));

  const categoryOptions: SearchOption[] = categories.map((c) => ({
    id: c.id,
    label: c.name,
    hint: c.category_group_name,
  }));

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto overflow-x-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">{updating ? "Categorize" : "Review & Send"}</h1>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 space-y-5">
        {updating && matchedTx && (
          <div className="rounded-2xl border border-orange-500/25 bg-orange-500/10 px-4 py-3">
            <p className="text-[13px] font-medium text-orange-200">
              Updating the imported charge — not creating a duplicate.
            </p>
            <p className="text-[12px] text-zinc-400 mt-1">
              {matchedTx.account_name} · {formatYnabAmount(matchedTx.amount)} · {matchedTx.date}
            </p>
            {!existingTransaction && (
              <button
                type="button"
                onClick={() => setForceCreate(true)}
                className="text-[12px] text-zinc-500 underline mt-2"
              >
                Create a new transaction instead
              </button>
            )}
          </div>
        )}

        {imagePreview && (
          <div className="rounded-xl overflow-hidden border border-zinc-800">
            <img
              src={imagePreview}
              alt="Receipt"
              className="w-full max-h-48 object-contain bg-zinc-900"
            />
          </div>
        )}

        {onAttachImage && (
          <button
            type="button"
            onClick={onAttachImage}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-[14px] text-zinc-200"
          >
            {imagePreview ? "Replace Amazon / receipt screenshot" : "Paste or snap Amazon order for item details"}
          </button>
        )}

        {(receipt.items?.length || order?.items?.length) ? (
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3">
            <p className="text-[11px] font-medium text-zinc-500 mb-1">Items</p>
            <p className="text-[13px] text-zinc-200 leading-snug">
              {(receipt.items.length ? receipt.items : order?.items || [])
                .map((i) => i.name)
                .join(", ")}
            </p>
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Merchant</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="w-full max-w-full box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        <DateField value={date} onChange={setDate} locked={updating} />

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Amount {updating ? "(from YNAB)" : isDeposit ? "(deposit)" : "(spent)"}
          </label>
          {updating ? (
            <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-[15px] text-zinc-300 tabular-nums">
              {formatYnabAmount(matchedTx!.amount)}
            </div>
          ) : (
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setIsDeposit((v) => !v)}
                className={`w-14 shrink-0 rounded-xl border flex items-center justify-center ${
                  isDeposit
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                    : "bg-red-500/20 border-red-500/50 text-red-400"
                }`}
                aria-label={isDeposit ? "Deposit. Tap for expense." : "Expense. Tap for deposit."}
              >
                {isDeposit ? <Plus className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
              </button>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 min-w-0 box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </div>
          )}
        </div>

        {!updating && (
          <SearchSelect
            label="Account"
            options={accountOptions}
            value={selectedAccount}
            onChange={(id) => {
              setSelectedAccount(id);
              setLastAccountId(id);
            }}
            placeholder="Choose account"
          />
        )}

        <SearchSelect
          label="Category"
          options={categoryOptions}
          value={selectedCategory}
          onChange={(id) => {
            setSelectedCategory(id);
            setSuggestedReason("");
          }}
          placeholder="Choose category"
          emptyOption={{ id: "", label: "— Uncategorized —" }}
        />
        {suggestedReason && (
          <p className="-mt-3 text-[11px] text-orange-300/80 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {suggestedReason}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Memo {receipt.kind === "receipt" ? "(optional)" : ""}
          </label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={receipt.kind === "receipt" ? "e.g. lunch with Amy" : "Order # and items"}
            className="w-full max-w-full box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        {budgets.length > 1 && !updating && (
          <SearchSelect
            label="Budget"
            options={budgets.map((b) => ({ id: b.id, label: b.name }))}
            value={selectedBudget}
            onChange={handleBudgetChange}
            placeholder="Choose budget"
          />
        )}

        <p className="text-[11px] text-zinc-600 leading-snug">
          Receipt photo is kept on this device for review only. YNAB’s public API does not yet allow
          attaching photos to transactions — you can still add the photo inside the YNAB app after
          sending.
        </p>

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 pb-6 safe-bottom">
        <button
          onClick={handleSubmit}
          disabled={submitting || (!updating && !selectedAccount)}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-[16px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />{" "}
              {updating
                ? "Save & approve in YNAB"
                : isDeposit
                  ? "Send deposit to YNAB"
                  : "Send to YNAB"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
