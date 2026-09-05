# Receipt Rocket

Snap a receipt → review → send straight to YNAB.

For Amazon (and other card imports): paste the order screenshot → match the charge already in YNAB → approve it. No duplicate transaction. Your YNAB token never leaves your device.

## Features

- Take photo, upload, or paste a receipt
- Grok vision extracts merchant, date, total, and (for Amazon) order numbers + items
- Inbox of unapproved / uncategorized YNAB charges
- Match a screenshot to imported bank transactions and update them in place
- Suggested category from item names
- Mandatory review before anything hits YNAB
- PWA-ready (Add to Home Screen on iPhone)

## Amazon flow (the usual pain)

YNAB only sees `Amazon −$49.81`. Amazon’s own transaction list doesn’t name the items either.

1. Open Receipt Rocket — unapproved YNAB charges show as “N to categorize”
2. In Amazon, open the order (or Your Orders / gift-card activity)
3. Screenshot it, paste into Receipt Rocket
4. We match amounts to the imported YNAB charge, fill the memo (`#order · items`), suggest a category
5. Save & approve — the existing YNAB transaction is updated, not duplicated

If amounts don’t line up (gift card vs card, split charges), pick the YNAB row by hand. Still faster than bouncing between apps.

Paper receipts still create a new YNAB transaction, unless we find an imported charge with the same amount.

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

The app walks them through:

1. Open YNAB → Account Settings → Developer Settings
2. Create a Personal Access Token
3. Paste it into Receipt Rocket

Token is stored only in `localStorage` on their device.
