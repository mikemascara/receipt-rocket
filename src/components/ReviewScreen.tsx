"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { getYnabToken, getBudgetId, setBudgetId } from "@/lib/storage";
import {
  fetchBudgets,
  fetchAccounts,
  fetchCategories,
  createTransaction,
  toMilliunits,
  type YnabBudget,
  type YnabAccount,
  type YnabCategory,
} from "@/lib/ynab";
import { ArrowLeft, Check, Loader2, Search, X } from "lucide-react";

export type ExtractedReceipt = {
  merchant: string;
  date: string;
  total: number;
  memo?: string;
};

type Props = {
  receipt: ExtractedReceipt;
  imagePreview?: string;
  onBack: () => void;
  onSuccess: () => void;
};

type SearchOption = { id: string; label: string };

function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  emptyOption,
}: {
  label: string;
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  emptyOption?: SearchOption;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected =
    options.find((o) => o.id === value) ||
    (emptyOption && value === emptyOption.id ? emptyOption : undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = emptyOption ? [emptyOption, ...options] : options;
    if (!q) return list;
    return list.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, emptyOption]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
      >
        <span className={selected ? "text-zinc-100 truncate" : "text-zinc-500 truncate"}>
          {selected?.label || placeholder}
        </span>
        <Search className="w-4 h-4 text-zinc-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-zinc-600 py-1"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="p-1 text-zinc-500">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">No matches</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id || "empty"}
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left px-4 py-3 text-[15px] hover:bg-zinc-800 ${
                    o.id === value ? "text-orange-400" : "text-zinc-100"
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewScreen({ receipt, imagePreview, onBack, onSuccess }: Props) {
  const [merchant, setMerchant] = useState(receipt.merchant);
  const [date, setDate] = useState(receipt.date);
  const [amount, setAmount] = useState(receipt.total.toFixed(2));
  // Start blank — user adds a note only if they want one
  const [memo, setMemo] = useState("");

  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const [categories, setCategories] = useState<YnabCategory[]>([]);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
          const [accts, cats] = await Promise.all([
            fetchAccounts(token, budgetId),
            fetchCategories(token, budgetId),
          ]);
          setAccounts(accts);
          setCategories(cats);
          if (accts.length) setSelectedAccount(accts[0].id);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load YNAB data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
      if (accts.length) setSelectedAccount(accts[0].id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleSubmit() {
    const token = getYnabToken();
    if (!token || !selectedBudget || !selectedAccount) return;

    setSubmitting(true);
    setError("");

    try {
      const dollars = parseFloat(amount);
      if (isNaN(dollars) || dollars <= 0) throw new Error("Enter a valid amount");

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Date must be YYYY-MM-DD (example: 2026-08-24)");
      }

      await createTransaction(token, selectedBudget, {
        account_id: selectedAccount,
        date,
        amount: toMilliunits(-dollars),
        payee_name: merchant || undefined,
        category_id: selectedCategory || undefined,
        memo: memo.trim() || undefined,
        cleared: "uncleared",
        approved: true,
      });

      onSuccess();
    } catch (e: any) {
      setError(e.message || "Failed to create transaction");
      setSubmitting(false);
    }
  }

  const accountOptions: SearchOption[] = accounts.map((a) => ({
    id: a.id,
    label: a.name,
  }));

  const categoryOptions: SearchOption[] = categories.map((c) => ({
    id: c.id,
    label: `${c.category_group_name} → ${c.name}`,
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
        <h1 className="text-lg font-semibold">Review & Send</h1>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 space-y-5">
        {imagePreview && (
          <div className="rounded-xl overflow-hidden border border-zinc-800">
            <img
              src={imagePreview}
              alt="Receipt"
              className="w-full max-h-48 object-contain bg-zinc-900"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Merchant</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="w-full max-w-full box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Date (YYYY-MM-DD)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="2026-08-24"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full max-w-full box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Amount ($)</label>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full max-w-full box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        <SearchSelect
          label="Account"
          options={accountOptions}
          value={selectedAccount}
          onChange={setSelectedAccount}
          placeholder="Choose account"
        />

        <SearchSelect
          label="Category"
          options={categoryOptions}
          value={selectedCategory}
          onChange={setSelectedCategory}
          placeholder="Choose category"
          emptyOption={{ id: "", label: "— Uncategorized —" }}
        />

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Memo (optional — leave blank if you don&apos;t need one)
          </label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. lunch with Amy"
            className="w-full max-w-full box-border bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        {budgets.length > 1 && (
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
          disabled={submitting || !selectedAccount}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-[16px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Check className="w-5 h-5" /> Send to YNAB
            </>
          )}
        </button>
      </div>
    </div>
  );
}
