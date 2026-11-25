# Bloom — architecture

Bloom is the owner's analytics desktop app for Blossom. It reads the same
Supabase database as the till (read-only) and answers the questions a florist
running a shop asks every month:

| Page | Question it answers |
|---|---|
| Overview | Am I on target? What should I look at today? (findings with links) |
| Sales | When, how and through which channel do I sell? 12-month trend, weekday × hour heatmap |
| Products | What sells, what earns? Margin per product, price vs list, trend, bought together, not selling |
| Customers | Who buys, who comes back, who is slipping away? Groups, win-back list, lifetime value |
| Money | Sales − flower purchases − running costs; who owes me, whom I owe |
| Operations | On-time delivery, lead time, reschedules, cancellations, team performance |
| Stock & waste | What runs out, what to reorder, what is thrown away |
| Orders | The full ledger, searchable |
| Settings | Daily target, reorder horizon, cost of items never bought through Suppliers |

Every chart bar, list row and table row is clickable: it either **filters the
whole app** (channel, payment, sale type, delivery, weekday, hour, product,
category, flower, customer, team member, wilaya) or **opens a detail panel**
(product, customer, order, day, team member). Every number has an ⓘ that says
how it is calculated. Every table sorts, searches and exports to CSV (Excel-ready).

## System

```
┌───────────────────────── Bloom.exe (Electron 44) ─────────────────────────┐
│ main.cjs: one sandboxed window, no Node in the page, strict CSP,           │
│           external links open in the browser, window size remembered       │
│                                                                            │
│ ┌──────────────── React 19 page (dist/, loaded from disk) ───────────────┐ │
│ │ AuthContext ── owner/manager gate (same accounts as Blossom)           │ │
│ │ AppState ── period · filters · page · drawer stack · prefs             │ │
│ │     │                                                                  │ │
│ │     ├─ data/load.js     SELECT-only, paged, all history in one go      │ │
│ │     ├─ model/dataset.js clean + link rows, costs, customer merge       │ │
│ │     ├─ model/filters.js period + cross-filters → selection             │ │
│ │     ├─ model/metrics.js every number (pure, unit-tested)               │ │
│ │     └─ model/insights.js plain-language findings                       │ │
│ │ pages/* · components/* (Drawers, DataTable, Charts, Heatmap)           │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ HTTPS · anon key + user's JWT · RLS applies
┌──────────────────────────────▼─────────── Supabase (Blossom) ─────────────┐
│ orders · order_items · products · supplier_transactions · suppliers       │
│ cash_register (cash_out) · stock_adjustments (removal) · flower_waste     │
│ settings (daily_target) · profiles                                        │
└───────────────────────────────────────────────────────────────────────────┘
```

All history is loaded once (about 1 500 orders, 4 000 lines today, under a
second) and recomputed in memory on every click (~0.1 s). It refreshes with the
button, and on its own when you come back after 5 minutes away.

## Business rules (all in `src/model/`)

| Rule | Definition |
|---|---|
| Counted sale | not archived, not voided, status ≠ cancelled, payment ≠ refunded |
| Sales value | `orders.total_amount` (after discounts / extra charges) |
| Collected / still owed | `amount_paid` (capped at total) / `amount_due` |
| Discount / extra | negative / positive `price_adjustment` |
| Unit cost | weighted average `unit_cost` of supplier purchases; a cost typed in Settings wins |
| Mistyped purchase | unit cost > 5× list price, or > 5× the product's usual cost → flagged, left out |
| Gross profit (est.) | sales × margin of costed items (coverage shown next to it) |
| Running costs | register cash-outs except Refund, Adjustment, Archived order reversal |
| Left after costs | sales − supplier purchases − running costs, by date |
| Same customer | keys sharing a customer link or a phone (last 9 digits) are merged; walk-ins pooled |
| Customer groups | Champion 4+ orders & ≤30 d · Loyal 2+ & ≤45 d · New first ≤30 d · At risk 2+ & 46–90 d · One-time · Lost >90 d |
| Target | daily target (Blossom settings or Settings page) × days in the period |
| Comparison | previous period of the same shape; while a period runs, only the same number of days |
| Stock tracked | stock < 5 000 (higher values are placeholders like 9 999) |
| Days left / reorder | stock ÷ avg daily sales of the last 30 days; reorder = cover days × rate − stock |
| Waste | `flower_waste` + stock removals not caused by an order, valued at unit cost |
| Time | shop time, Africa/Algiers (UTC+1) |

Checked on 2026-11-25 against the live database: November 313 orders,
1 183 020 DA; `npm test` covers every rule above (11 tests).

## Security

- Read-only by construction: no insert/update/delete anywhere.
- Opens for active owner / manager accounts; RLS still decides what each account sees
  (some money tables are owner-only, Bloom says so instead of showing an error).
- Desktop window: `contextIsolation`, `sandbox`, no `nodeIntegration`, navigation locked
  to the app, CSP allows network only to the Blossom Supabase project.
- Preferences (target, cover days, manual costs) stay on this PC (`localStorage`).

## Build and release

```
npm run dev        # browser at http://localhost:5180 (sign in as owner)
npm test           # business-rule tests
npm run desktop    # build and open the desktop app
npm run dist:win   # installer → release/Bloom-Setup-<version>.exe (never publishes)
```

Electron's binary is the one already used by Blossom (same version, 44.10.2),
because npm could not download it on this network. `node_modules/electron/dist`
was copied from `floral-os-1.0.13`.

## Next steps worth doing

| Idea | Why |
|---|---|
| Auto-update through a GitHub release repo (like Blossom) | New versions reach the shop PC without reinstalling |
| Record colours on products in Blossom | Unlocks "which colours sell" |
| Keep stock real (no 9 999 placeholders) | Unlocks reorder warnings for every product |
| Log waste in Blossom again (last entry 1 Sept) | Shows the true cost of spoilage |
| Move sums to a Postgres function once orders pass ~50 000 | Keeps loading instant (apply by hand in the SQL Editor, never `db push`) |
