const TOKEN_KEY = "receipt-rocket-ynab-token";
const BUDGET_KEY = "receipt-rocket-ynab-budget-id";
const ACCOUNT_KEY = "receipt-rocket-ynab-account-id";
const GMAIL_USER_KEY = "receipt-rocket-gmail-user";
const GMAIL_PASS_KEY = "receipt-rocket-gmail-app-pass";

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
  localStorage.removeItem(ACCOUNT_KEY);
}

export function getBudgetId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BUDGET_KEY);
}

export function setBudgetId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUDGET_KEY, id);
}

export function getLastAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCOUNT_KEY);
}

export function setLastAccountId(id: string): void {
  if (typeof window === "undefined") return;
  if (!id) return;
  localStorage.setItem(ACCOUNT_KEY, id);
}

export function getGmailUser(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GMAIL_USER_KEY);
}

export function getGmailAppPassword(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GMAIL_PASS_KEY);
}

export function setGmailCredentials(user: string, appPassword: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GMAIL_USER_KEY, user.trim());
  localStorage.setItem(GMAIL_PASS_KEY, appPassword.trim().replace(/\s+/g, ""));
}

export function clearGmailCredentials(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GMAIL_USER_KEY);
  localStorage.removeItem(GMAIL_PASS_KEY);
}
