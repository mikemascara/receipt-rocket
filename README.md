# Receipt Rocket

Snap a receipt → review → send straight to YNAB.

Mobile-first web app. Your YNAB token never leaves your device.

## Features

- Take photo or upload a receipt
- Grok vision extracts merchant, date, and total
- Mandatory review screen before anything hits YNAB
- Clear instructions for generating a Personal Access Token
- Works for anyone — each user connects their own YNAB account
- PWA-ready (Add to Home Screen on iPhone)

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
