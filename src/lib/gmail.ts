import type { AmazonOrder } from "./amazon-email";

export async function fetchAmazonOrdersFromGmail(creds: {
  user: string;
  appPassword: string;
  days?: number;
}): Promise<AmazonOrder[]> {
  const res = await fetch("/api/amazon-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: creds.user,
      appPassword: creds.appPassword,
      days: creds.days || 30,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not read Amazon emails");
  return Array.isArray(data.orders) ? data.orders : [];
}
