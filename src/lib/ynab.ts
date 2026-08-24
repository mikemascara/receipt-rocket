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

function isArchivedBudgetName(name: string): boolean {
  return /\barchived\b/i.test(name);
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

  // Prefer active budgets; keep archived only if nothing else exists
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
    if (group.hidden || group.deleted) continue;
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

export function toMilliunits(dollars: number): number {
  return Math.round(dollars * 1000);
}
