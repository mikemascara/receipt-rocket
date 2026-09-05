# Receipt Rocket

Snap a receipt → review → send straight to YNAB.

For Amazon: the **Amazon** tab reads the order emails you already get, matches them to the blank imported charges in YNAB, fills in what you bought, and approves — without opening Amazon.

Your YNAB token never leaves your device.

## Features

- Inbox of unapproved / uncategorized YNAB charges
- **Amazon tab** — sync Gmail order emails (`Ordered: 1 Shoes item`), match by amount, write memo + category onto the existing YNAB charge
- Paper receipts: take photo / upload / paste, then send to YNAB
- Suggested category from item / department names
- PWA-ready (Add to Home Screen on iPhone)

## Amazon (no Amazon app)

Amazon’s bank feed is just `Amazon −$49.81`. The confirmation email has the order number, total, and department (Shoes, Bedding, Electronics…).

1. Open Receipt Rocket → **Amazon**
2. One-time: Gmail address + [App Password](https://myaccount.google.com/apppasswords)
3. Tap **Find what I bought**
4. Check the matches, pick a category, **Save & approve**

Gift-card and Marketplace splits sometimes mean the email total ≠ the card amount. Pick the order by hand — you still see “Shoes $40.81” without opening Amazon.

Optional: upload Amazon’s order-history CSV if you want full product titles.

## Quick Start (Vercel)

1. Import this repo into Vercel
2. Add environment variable: `XAI_API_KEY` = your xAI API key (from console.x.ai)
3. Deploy

## Local Development

```bash
npm install
cp .env.example .env.local
# edit .env.local and add your XAI_API_KEY
npm run dev
```

## How users connect YNAB

1. Open YNAB → Account Settings → Developer Settings
2. Create a Personal Access Token
3. Paste it into Receipt Rocket

Token is stored only in `localStorage` on their device.
