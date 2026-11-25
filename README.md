# Bloom 🌸

The owner's analytics app for Blossom: sales, profit, products, customers,
money, deliveries, stock and waste. Every number is clickable and explains
how it is calculated. Read-only, same Supabase and accounts as Blossom POS.

## Install on a PC

Run `release/Bloom-Setup-1.0.0.exe`, then open **Bloom** from the desktop.
Sign in with a Blossom **owner** or **manager** account (username or email).

## Develop

```
npm install
npm run dev        # browser at http://localhost:5180
npm test           # business-rule tests
npm run desktop    # open as a desktop app
npm run dist:win   # build the Windows installer into release/
```

`.env` holds the Supabase URL and anon key (copy `.env.example`).
How everything is calculated: `docs/ARCHITECTURE.md`.
