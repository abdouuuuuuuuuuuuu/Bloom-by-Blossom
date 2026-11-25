# Blossom Mobile 🌸

The order workflow of Blossom POS, on the phone. Same shop database, same
accounts, same server rules as Blossom on the shop PC.

| Tab | What you do there |
|---|---|
| **Today** | What is late, due today and tomorrow; today's sales (owner/manager); money still owed; deliveries out |
| **Orders** | Search and filter (to do, deliveries, unpaid, done). Open an order to: start preparing → hand to courier → mark delivered (or collected), take a payment, change the date, call or WhatsApp the customer, open the address in Maps, cancel (owner/manager) |
| **New** | 3 steps: pick flowers → customer & delivery (a known phone number fills in the customer) → discount and payment (paid, part, later). Or "Sold now" for a counter sale. Then send a WhatsApp confirmation in one tap |
| **Me** | Account, what your role allows, install on the home screen, sign out |

Stays on the PC on purpose: editing items, refunds, printing, stock, cash register, suppliers, loyalty petals, reports.

## How it saves

Every change calls the same Supabase functions as Blossom POS
(`blossom_create_order`, `set_order_status`, `record_order_payment`,
`mark_order_handed_off`, `mark_order_delivered`, `reschedule_order`,
`blossom_void_order`). The database checks roles, totals, stock and the cash
register; the phone cannot bypass them. New orders and payments carry a request
id, so a retry after a dropped connection never saves twice. An unfinished new
order is kept on the phone until it is saved.

Roles (same as the PC): owner/manager everything · florist no cancelling ·
cashier new orders and payments · delivery hand-off and delivered only.

## Put it online with Netlify

**Option A: drag and drop (fastest)**
1. In this folder: `npm install` then `npm run build` (needs `.env`, see `.env.example`).
2. On app.netlify.com: Add new site → Deploy manually → drop the `dist` folder.

**Option B: from GitHub (updates deploy by themselves)**
1. This app lives in the `mobile/` folder of the Bloom-by-Blossom repository.
2. Netlify: Add new site → Import from Git → pick Bloom-by-Blossom, and set **Base directory** to `mobile`. `mobile/netlify.toml` sets the rest (build command, `dist`, headers).
3. Site configuration → Environment variables: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (same values as Blossom's `.env`), then redeploy.

Then open the site on the phone and add it to the home screen (Me tab explains how).

## Develop

```
npm install
npm run dev            # http://<this PC>:5190, reachable from a phone on the same Wi-Fi
npm test               # order rules (totals, validation, payload = what Blossom POS sends)
```

`npm run dev` with `?demo` in the address (`/?demo&role=florist`) opens a
made-up shop in memory to try every screen without touching real data. Demo
mode only exists in development; it is not in the built site.
