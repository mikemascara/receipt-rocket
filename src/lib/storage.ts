const TOKEN_KEY = "receipt-rocket-ynab-token";
const BUDGET_KEY = "receipt-rocket-ynab-budget-id";

export function getYnabToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setYnabToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearYnabToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BUDGET_KEY);
}

export function getBudgetId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BUDGET_KEY);
}

export function setBudgetId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUDGET_KEY, id);
}
