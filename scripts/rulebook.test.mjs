// Runs supabase/shop-rulebook.sql on a real (in-memory) Postgres and checks
// that every number matches Bloom's own model on the same data.
// If the two ever disagree, one of the rules has drifted: fix it in both
// supabase/shop-rulebook.sql and src/model/rules.js.
//
// Needs the dev dependency @electric-sql/pglite; skipped when it is missing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDataset } from '../src/model/dataset.js'
import { buildBackOffice, accounts } from '../src/model/backoffice.js'
import { tillDays } from '../src/model/journal.js'
import { select } from '../src/model/filters.js'
import { makePeriod } from '../src/model/period.js'

let PGlite = null
try { ({ PGlite } = await import('@electric-sql/pglite')) } catch { /* not installed */ }
const maybe = PGlite ? test : test.skip

const sql = (name) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')

// The parts of Blossom's tables the rulebook reads (real column names and types).
const SCHEMA = `
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE profiles (id uuid PRIMARY KEY, full_name text, username text, role text, is_active boolean DEFAULT true);
CREATE TABLE products (product_id int PRIMARY KEY, item_name text, category text, retail_price numeric, wholesale_cost numeric DEFAULT 0, stock_level int, low_stock_threshold int, supplier_id int, is_active boolean DEFAULT true);
CREATE TABLE suppliers (supplier_id int PRIMARY KEY, company_name text, contact_person text, phone text, supplier_status text DEFAULT 'active');
CREATE TABLE orders (id uuid PRIMARY KEY, order_number text, created_at timestamptz, status text, order_type text, payment_method text, payment_status text,
  client_source text, client_name text, client_phone text, customer_id int, total_amount numeric, amount_paid numeric, amount_due numeric, price_adjustment numeric,
  created_by uuid, cashier_id uuid, voided_at timestamptz, deleted_at timestamptz);
CREATE TABLE order_items (id int PRIMARY KEY, order_id uuid, product_id int, product_name text, quantity int, unit_price numeric, total_price numeric, category text);
CREATE TABLE supplier_transactions (transaction_id int PRIMARY KEY, supplier_id int, product_id int, quantity int, unit_cost int, total_cost int, amount_paid int,
  payment_status text, transaction_type text, transaction_date date, received_at timestamptz, created_at timestamptz, voided_at timestamptz);
CREATE TABLE supplier_payments (payment_id int PRIMARY KEY, supplier_id int, amount numeric, payment_method text, notes text, transaction_id int, paid_at timestamptz, created_at timestamptz);
CREATE TABLE cash_register (id uuid PRIMARY KEY, transaction_type text, amount numeric, description text, category text, payment_method text, register_date date,
  user_id uuid, created_by uuid, created_at timestamptz, order_id uuid, quantity numeric, unit_price numeric,
  counted_cash int, counted_baridimob int, counted_usd int, banked_overnight int);
CREATE TABLE stock_adjustments (id int PRIMARY KEY, product_id int, adjustment_type text, quantity int, reason text, previous_stock int, new_stock int, created_by uuid, created_at timestamptz);
CREATE TABLE flower_waste (id int PRIMARY KEY, product_id int, quantity int, reason text, unit_cost numeric, waste_date date, created_by uuid);
`

const OWNER = '00000000-0000-4000-8000-000000000001'
const SARA = '00000000-0000-4000-8000-000000000002'
const u = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const at = (day, hm = '10:00') => `${day}T${hm}:00+01:00`

// One small shop month with every awkward case.
const data = {
  profiles: [{ id: OWNER, full_name: 'Owner', username: 'owner', role: 'owner', is_active: true }, { id: SARA, full_name: 'Sara', username: 'sara', role: 'cashier', is_active: true }],
  products: [
    { product_id: 1, item_name: 'RED ROSE', category: 'Flowers', retail_price: 300, wholesale_cost: 0, stock_level: 80, is_active: true },
    { product_id: 2, item_name: 'Teddy', category: 'Gifts', retail_price: 2500, wholesale_cost: 1200, stock_level: 6, is_active: true },
    { product_id: 3, item_name: 'LILY', category: 'Flowers', retail_price: 600, wholesale_cost: 0, stock_level: 10, is_active: true },
  ],
  suppliers: [{ supplier_id: 1, company_name: 'Flora', supplier_status: 'active' }],
  orders: [
    { id: u(1), order_number: '1', created_at: at('2026-11-02'), status: 'done', payment_status: 'paid', total_amount: 3000, amount_paid: 3000, amount_due: 0, price_adjustment: 0, created_by: SARA },
    { id: u(2), order_number: '2', created_at: at('2026-11-05'), status: 'done', payment_status: 'partial', total_amount: 5000, amount_paid: 2000, amount_due: 3000, price_adjustment: -500, created_by: SARA },
    { id: u(3), order_number: '3', created_at: at('2026-11-06'), status: 'cancelled', payment_status: 'paid', total_amount: 9000, amount_paid: 9000, amount_due: 0, created_by: SARA },
    { id: u(4), order_number: '4', created_at: at('2026-11-07'), status: 'done', payment_status: 'paid', total_amount: 7000, amount_paid: 7000, amount_due: 0, voided_at: at('2026-11-07', '11:00'), created_by: SARA },
    { id: u(5), order_number: '5', created_at: at('2026-11-08'), status: 'done', payment_status: 'refunded', total_amount: 4000, amount_paid: 4000, amount_due: 0, created_by: SARA },
    { id: u(6), order_number: '6', created_at: at('2026-11-09'), status: 'done', payment_status: 'paid', total_amount: 8000, amount_paid: 8000, amount_due: 0, deleted_at: at('2026-11-09', '12:00'), created_by: SARA },
    { id: u(7), order_number: '7', created_at: at('2026-10-30'), status: 'done', payment_status: 'paid', total_amount: 1000, amount_paid: 1000, amount_due: 0, created_by: SARA },
    // 23:30 in Algiers on the 30th is already December 1st in no time zone; still November for the shop.
    { id: u(8), order_number: '8', created_at: '2026-11-30T23:30:00+01:00', status: 'done', payment_status: 'paid', total_amount: 600, amount_paid: 600, amount_due: 0, created_by: SARA },
  ],
  order_items: [
    { id: 1, order_id: u(1), product_id: 1, product_name: 'RED ROSE', quantity: 10, unit_price: 300, total_price: 3000 },
    { id: 2, order_id: u(2), product_id: 2, product_name: 'Teddy', quantity: 1, unit_price: 2500, total_price: 2500 },
    { id: 3, order_id: u(2), product_id: 1, product_name: 'RED ROSE', quantity: 5, unit_price: 300, total_price: 1500 },
    { id: 4, order_id: u(2), product_id: 3, product_name: 'LILY', quantity: 2, unit_price: 500, total_price: 1000 },
    { id: 5, order_id: u(3), product_id: 1, product_name: 'RED ROSE', quantity: 30, unit_price: 300, total_price: 9000 },
    { id: 6, order_id: u(8), product_id: 3, product_name: 'LILY', quantity: 1, unit_price: 600, total_price: 600 },
  ],
  supplier_transactions: [
    { transaction_id: 1, supplier_id: 1, product_id: 1, quantity: 100, unit_cost: 140, total_cost: 14000, amount_paid: 0, payment_status: 'unpaid', transaction_type: 'purchase', transaction_date: '2026-11-03', created_at: at('2026-11-03') },
    { transaction_id: 2, supplier_id: 1, product_id: 1, quantity: 100, unit_cost: 160, total_cost: 16000, amount_paid: 0, payment_status: 'unpaid', transaction_type: 'purchase', transaction_date: '2026-11-10', created_at: at('2026-11-10') },
    { transaction_id: 3, supplier_id: 1, product_id: 1, quantity: 1, unit_cost: 90000, total_cost: 90000, amount_paid: 0, payment_status: 'unpaid', transaction_type: 'purchase', transaction_date: '2026-11-11', created_at: at('2026-11-11') },
    { transaction_id: 4, supplier_id: 1, product_id: 1, quantity: 50, unit_cost: 150, total_cost: 7500, amount_paid: 0, payment_status: 'unpaid', transaction_type: 'purchase', transaction_date: '2026-11-12', created_at: at('2026-11-12'), voided_at: at('2026-11-12', '12:00') },
  ],
  supplier_payments: [{ payment_id: 1, supplier_id: 1, amount: 15000, payment_method: 'cash', notes: 'Weekly', paid_at: at('2026-11-12', '17:00'), created_at: at('2026-11-12', '17:00') }],
  cash_register: [
    { id: u(101), transaction_type: 'opening', amount: 5000, register_date: '2026-11-20', created_by: OWNER, created_at: at('2026-11-20', '08:00') },
    { id: u(102), transaction_type: 'cash_in', amount: 3000, category: 'Order payment', payment_method: 'cash', order_id: u(1), register_date: '2026-11-20', created_by: SARA, created_at: at('2026-11-20', '10:00') },
    { id: u(103), transaction_type: 'cash_in', amount: 2000, category: 'Quick sale', payment_method: 'baridimob', register_date: '2026-11-20', created_by: SARA, created_at: at('2026-11-20', '11:00') },
    { id: u(104), transaction_type: 'cash_out', amount: 400, category: 'Transport', description: 'Taxi', payment_method: 'cash', register_date: '2026-11-20', created_by: SARA, created_at: at('2026-11-20', '12:00') },
    { id: u(105), transaction_type: 'cash_out', amount: 10000, category: 'Salary', description: 'Walid salary', payment_method: 'cash', register_date: '2026-11-20', created_by: OWNER, created_at: at('2026-11-20', '18:00') },
    { id: u(106), transaction_type: 'cash_out', amount: 700, category: 'Refund', description: 'Refund ORDER #5', payment_method: 'cash', register_date: '2026-11-20', created_by: OWNER, created_at: at('2026-11-20', '18:30') },
    { id: u(107), transaction_type: 'cash_out', amount: 6000, category: 'Banked overnight', description: 'Banked overnight', payment_method: 'cash', register_date: '2026-11-20', created_by: OWNER, created_at: at('2026-11-20', '19:00') },
    { id: u(108), transaction_type: 'closing', amount: 3000, category: 'Closing', description: 'Closing balance', register_date: '2026-11-20', created_by: OWNER, created_at: at('2026-11-20', '19:01'),
      counted_cash: 7000, counted_baridimob: 2000, counted_usd: 0, banked_overnight: 6000 },
  ],
  stock_adjustments: [
    { id: 1, product_id: 1, adjustment_type: 'received', quantity: 100, reason: 'Supplier delivery', previous_stock: 0, new_stock: 100, created_by: OWNER, created_at: at('2026-11-03') },
    { id: 2, product_id: 1, adjustment_type: 'removal', quantity: 3, reason: 'Broken', previous_stock: 100, new_stock: 97, created_by: SARA, created_at: at('2026-11-04') },
    { id: 3, product_id: 1, adjustment_type: 'removal', quantity: 2, reason: 'Order #12', previous_stock: 97, new_stock: 95, created_by: SARA, created_at: at('2026-11-04', '11:00') },
    { id: 4, product_id: 2, adjustment_type: 'removal', quantity: 1, reason: 'Waste: Broken / damaged', previous_stock: 7, new_stock: 6, created_by: OWNER, created_at: at('2026-11-15') },
  ],
  flower_waste: [{ id: 1, product_id: 1, quantity: 5, reason: 'Wilted', unit_cost: 0, waste_date: '2026-11-21', created_by: SARA }],
  bloom_staff: [{ id: 1, full_name: 'Walid', monthly_salary: 25000, is_active: true }],
  bloom_staff_payments: [
    { id: 1, staff_id: 1, kind: 'advance', for_month: '2026-11', amount: 5000, paid_on: '2026-11-10', payment_method: 'cash', from_register: false },
    { id: 2, staff_id: 1, kind: 'salary', for_month: '2026-11', amount: 10000, paid_on: '2026-11-20', payment_method: 'cash', from_register: true },
    { id: 3, staff_id: 1, kind: 'deduction', for_month: '2026-11', amount: 1000, paid_on: '2026-11-20', payment_method: 'cash', from_register: false },
    { id: 4, staff_id: 1, kind: 'bonus', for_month: '2026-11', amount: 2000, paid_on: '2026-11-25', payment_method: 'bank', from_register: false },
    { id: 5, staff_id: 1, kind: 'bonus', for_month: '2026-11', amount: 999, paid_on: '2026-11-25', payment_method: 'bank', from_register: false, voided_at: at('2026-11-25', '12:00') },
  ],
  bloom_expenses: [
    { id: 1, spent_on: '2026-11-01', category: 'Rent', description: 'November rent', amount: 20000, payment_method: 'bank' },
    { id: 2, spent_on: '2026-11-02', category: 'Other', description: 'typo', amount: 999, payment_method: 'cash', voided_at: at('2026-11-02', '12:00') },
  ],
}

/** The same rows, shaped the way Bloom's loader returns them. */
function bloomRaw() {
  return {
    orders: data.orders, items: data.order_items, products: data.products, suppliers: data.suppliers,
    purchases: data.supplier_transactions.filter((t) => !t.voided_at),
    supplierPayments: data.supplier_payments, cash: data.cash_register,
    adjustments: data.stock_adjustments, waste: data.flower_waste, profiles: data.profiles, settings: [],
    staff: data.bloom_staff, staffPayments: data.bloom_staff_payments.filter((p) => !p.voided_at),
    bExpenses: data.bloom_expenses.filter((e) => !e.voided_at), attendance: [], purchaseOrders: [], poLines: [],
  }
}

async function database() {
  const db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(sql('bloom-back-office.sql'))
  await db.exec(sql('shop-rulebook.sql'))
  for (const [table, rows] of Object.entries(data)) {
    for (const row of rows) {
      const cols = Object.keys(row)
      await db.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((c) => row[c]))
    }
  }
  await db.exec(`SET test.uid = '${OWNER}'`)
  return db
}

const close = (a, b, msg) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.01, `${msg}: database ${a} vs Bloom ${b}`)

maybe('the database rulebook and Bloom agree on the month', async () => {
  const db = await database()
  const nov = makePeriod('month', '2026-11')
  const ds = buildDataset(bloomRaw())
  const bo = buildBackOffice(bloomRaw(), ds)
  const js = accounts(ds, bo, select(ds, nov), nov)
  const { rows: [{ s }] } = await db.query(`SELECT public.shop_period_summary('2026-11-01', '2026-11-30') AS s`)

  close(s.sales, js.sales, 'sales')
  assert.equal(Number(s.sales), 3000 + 5000 + 600)            // cancelled, voided, refunded, deleted and October orders left out
  close(s.collected, js.collected, 'collected')
  close(s.cost_of_goods, js.cogs, 'cost of goods')
  close(s.gross_profit, js.gross, 'gross profit')
  close(s.till_costs, js.tillCosts, 'till costs')
  assert.equal(Number(s.till_costs), 400 + 10000)              // banking and the refund are not costs
  close(s.office_costs, js.officeCosts, 'office costs')
  close(s.staff_costs, js.staffCosts, 'staff pay')
  assert.equal(Number(s.staff_costs), 5000 + 2000)             // the till-paid salary is counted once, in the till
  close(s.staff_paid_from_till, js.staffFromTill, 'staff paid from the till')
  close(s.waste_cost, js.wasteCost, 'waste')
  close(s.net_profit, js.net, 'net profit')
  close(s.paid_to_suppliers, js.cash.suppliers, 'paid to suppliers')
  close(s.cash_result, js.cash.net, 'cash result')
  close(s.purchased, js.purchased, 'stock bought')
  assert.equal(Number(s.purchased), 14000 + 16000)             // the 90 000 typo and the voided delivery are left out
  await db.close()
})

maybe('product costs agree, including the wholesale fallback', async () => {
  const db = await database()
  const ds = buildDataset(bloomRaw())
  const { rows } = await db.query('SELECT product_id, avg_cost, cost_source FROM public.shop_product_cost ORDER BY product_id')
  for (const r of rows) {
    const p = ds.products.get(r.product_id)
    if (r.avg_cost == null) assert.equal(p.cost, null, `product ${r.product_id} has no cost`)
    else close(r.avg_cost, p.cost, `cost of product ${r.product_id}`)
  }
  assert.equal(rows.find((r) => r.product_id === 2).cost_source, 'manual')
  close(rows.find((r) => r.product_id === 1).avg_cost, 150, 'rose cost (typo ignored)')
  await db.close()
})

maybe('the till day agrees: expected, counted, difference', async () => {
  const db = await database()
  const ds = buildDataset(bloomRaw())
  const [js] = tillDays(bloomRaw(), ds, makePeriod('month', '2026-11'))
  const { rows: [d] } = await db.query(`SELECT * FROM public.shop_till_days WHERE day = '2026-11-20'`)
  close(d.opening, js.opening, 'opening')
  close(d.money_in, js.in, 'in')
  close(d.money_out, js.out, 'out')
  close(d.expected, js.expected, 'expected')
  close(d.closing, js.closing, 'closing')
  close(d.difference, js.difference, 'difference')
  close(d.banked, js.banked, 'banked')
  await db.close()
})

maybe('the Friday closing covers Saturday to Friday', async () => {
  const db = await database()
  const { rows: [{ c }] } = await db.query(`SELECT public.shop_friday_closing('2026-11-26') AS c`)
  assert.equal(c.week_start, '2026-11-21')
  assert.equal(c.week_end, '2026-11-27')
  assert.equal(c.days.length, 7)
  assert.equal(c.days[0].day, '2026-11-21')
  await db.close()
})

maybe('only owners and managers can read the accounts', async () => {
  const db = await database()
  await db.exec(`SET test.uid = '${SARA}'`)
  await assert.rejects(db.query(`SELECT public.shop_period_summary('2026-11-01', '2026-11-30')`), /owner or manager/)
  await db.close()
})
