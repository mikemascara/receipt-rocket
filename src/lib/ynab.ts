const YNAB_BASE = "https://api.ynab.com/v1";

export type YnabBudget = {
  id: string;
  name: string;
};

export type YnabAccount = {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
};

export type YnabCategory = {
  id: string;
  name: string;
  category_group_name: string;
  hidden: boolean;
  deleted: boolean;
};

export type YnabTransaction = {
  id: string;
  date: string;
  amount: number;
  payee_name: string | null;
  payee_id: string | null;
  account_id: string;
  account_name: string;
  category_id: string | null;
  category_name: string | null;
  memo: string | null;
  approved: boolean;
  cleared: "cleared" | "uncleared" | "reconciled";
  deleted: boolean;
  transfer_account_id: string | null;
};

function isArchivedBudgetName(name: string): boolean {
  return /\barchived\b/i.test(name);
}

function isInternalGroup(name: string): boolean {
  return /internal master category/i.test(name);
}

function mapTransaction(t: any): YnabTransaction {
  return {
    id: t.id,
    date: t.date,
    amount: t.amount,
    payee_name: t.payee_name ?? null,
    payee_id: t.payee_id ?? null,
    account_id: t.account_id,
    account_name: t.account_name || "",
    category_id: t.category_id ?? null,
    category_name: t.category_name ?? null,
    memo: t.memo ?? null,
    approved: Boolean(t.approved),
    cleared: t.cleared || "uncleared",
    deleted: Boolean(t.deleted),
    transfer_account_id: t.transfer_account_id ?? null,
  };
}

export async function fetchBudgets(token: string): Promise<YnabBudget[]> {
  const res = await fetch(`${YNAB_BASE}/budgets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.detail || `YNAB error ${res.status}`);
  }
  const data = await res.json();
  const budgets: YnabBudget[] = data.data.budgets.map((b: any) => ({
    id: b.id,
    name: b.name,
  }));

  const active = budgets.filter((b) => !isArchivedBudgetName(b.name));
  return active.length > 0 ? active : budgets;
}

export async function fetchAccounts(token: string, budgetId: string): Promise<YnabAccount[]> {
  const res = await fetch(`${YNAB_BASE}/budgets/${budgetId}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
  const data = await res.json();
  return data.data.accounts.filter((a: any) => !a.closed && a.on_budget);
}

export async function fetchCategories(token: string, budgetId: string): Promise<YnabCategory[]> {
  const res = await fetch(`${YNAB_BASE}/budgets/${budgetId}/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load categories (${res.status})`);
  const data = await res.json();
  const cats: YnabCategory[] = [];
  for (const group of data.data.category_groups) {
    if (group.hidden || group.deleted || isInternalGroup(group.name)) continue;
    for (const cat of group.categories) {
      if (cat.hidden || cat.deleted) continue;
      cats.push({
        id: cat.id,
        name: cat.name,
        category_group_name: group.name,
        hidden: false,
        deleted: false,
      });
    }
  }
  return cats;
}

export async function fetchTransactions(
  token: string,
  budgetId: string,
  opts?: { sinceDate?: string; type?: "unapproved" | "uncategorized" }
): Promise<YnabTransaction[]> {
  const params = new URLSearchParams();
  if (opts?.sinceDate) params.set("since_date", opts.sinceDate);
  if (opts?.type) params.set("type", opts.type);
  const qs = params.toString();
  const url = `${YNAB_BASE}/budgets/${budgetId}/transactions${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load transactions (${res.status})`);
  const data = await res.json();
  return (data.data.transactions || [])
    .map(mapTransaction)
    .filter((t: YnabTransaction) => !t.deleted && !t.transfer_account_id);
}

export type CreateTransactionPayload = {
  account_id: string;
  date: string;
  amount: number;
  payee_name?: string;
  category_id?: string;
  memo?: string;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
};

export async function createTransaction(
  token: string,
  budgetId: string,
  tx: CreateTransactionPayload
) {
  const res = await fetch(`${YNAB_BASE}/budgets/${budgetId}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transaction: tx }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.detail || `Failed to create transaction (${res.status})`);
  }
  return res.json();
}

export type UpdateTransactionPayload = {
  account_id: string;
  date: string;
  amount: number;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
};

export async function updateTransaction(
  token: string,
  budgetId: string,
  transactionId: string,
  tx: UpdateTransactionPayload
) {
  const res = await fetch(`${YNAB_BASE}/budgets/${budgetId}/transactions/${transactionId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transaction: tx }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.detail || `Failed to update transaction (${res.status})`);
  }
  return res.json();
}

export function toMilliunits(dollars: number): number {
  return Math.round(dollars * 1000);
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
