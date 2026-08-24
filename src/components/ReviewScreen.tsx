"use client";

import { useState, useEffect } from "react";
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
import { ArrowLeft, Check, Loader2 } from "lucide-react";

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

export default function ReviewScreen({ receipt, imagePreview, onBack, onSuccess }: Props) {
  const [merchant, setMerchant] = useState(receipt.merchant);
  const [date, setDate] = useState(receipt.date);
  const [amount, setAmount] = useState(receipt.total.toFixed(2));
  const [memo, setMemo] = useState(receipt.memo || "");

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
        const budgetId = savedBudget && b.find((x) => x.id === savedBudget) ? savedBudget : b[0]?.id;
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

      await createTransaction(token, selectedBudget, {
        account_id: selectedAccount,
        date,
        amount: toMilliunits(-dollars),
        payee_name: merchant || undefined,
        category_id: selectedCategory || undefined,
        memo: memo || undefined,
        cleared: "uncleared",
        approved: true,
      });

      onSuccess();
    } catch (e: any) {
      setError(e.message || "Failed to create transaction");
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
        <h1 className="text-lg font-semibold">Review & Send</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">
        {imagePreview && (
          <div className="rounded-xl overflow-hidden border border-zinc-800">
            <img src={imagePreview} alt="Receipt" className="w-full max-h-48 object-contain bg-zinc-900" />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Merchant</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Amount ($)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account</label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          >
            <option value="">— Uncategorized —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.category_group_name} → {c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Memo (optional)</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Costco run"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        {budgets.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Budget</label>
            <select
              value={selectedBudget}
              onChange={(e) => handleBudgetChange(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            >
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

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
            <><Loader2 className="w-5 h-5 animate-spin" /> Sending…</>
          ) : (
            <><Check className="w-5 h-5" /> Send to YNAB</>
          )}
        </button>
      </div>
    </div>
  );
}
