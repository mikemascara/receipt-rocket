import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseAmazonEmail, type AmazonOrder } from "@/lib/amazon-email";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Reads Amazon "Ordered:" confirmation emails via Gmail IMAP.
 * App password is used for this request only and is not stored on the server.
 */
export async function POST(req: NextRequest) {
  let client: ImapFlow | null = null;
  try {
    const body = await req.json();
    const user = String(body?.user || "").trim();
    const pass = String(body?.appPassword || "").replace(/\s+/g, "");
    const days = Math.min(90, Math.max(7, Number(body?.days) || 30));

    if (!user || !user.includes("@")) {
      return NextResponse.json({ error: "Enter your Gmail address" }, { status: 400 });
    }
    if (!pass || pass.length < 8) {
      return NextResponse.json({ error: "Enter a Gmail App Password" }, { status: 400 });
    }

    client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const orders: AmazonOrder[] = [];
    const seen = new Set<string>();

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const uids = await client.search({ from: "auto-confirm@amazon.com", sentSince: since }, { uid: true });
      const list = (uids || []).slice(-50);

      if (list.length) {
        for await (const msg of client.fetch(list, { envelope: true, source: true }, { uid: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const subject = parsed.subject || msg.envelope?.subject || "";
          const text = typeof parsed.text === "string" ? parsed.text : "";
          const html = typeof parsed.html === "string" ? parsed.html : "";
          const date = parsed.date || msg.envelope?.date;
          const order = parseAmazonEmail({
            subject,
            text,
            html,
            date: date ? new Date(date).toISOString() : undefined,
          });
          if (!order || seen.has(order.orderId)) continue;
          seen.add(order.orderId);
          orders.push(order);
        }
      }
    } finally {
      lock.release();
    }

    orders.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return NextResponse.json({ orders });
  } catch (err: any) {
    const msg = String(err?.message || err || "IMAP error");
    console.error("amazon-orders", msg);
    if (/auth|invalid credentials|login/i.test(msg)) {
      return NextResponse.json(
        { error: "Gmail login failed. Use an App Password, not your normal Gmail password." },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "Could not read Gmail. Check the App Password and try again." }, { status: 502 });
  } finally {
    try {
      await client?.logout();
    } catch {
      // ignore
    }
  }
}
