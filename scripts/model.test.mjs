import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDataset, customerKey, isCounted } from '../src/model/dataset.js'
import { select } from '../src/model/filters.js'
import { makePeriod, comparablePrevious, previousPeriod } from '../src/model/period.js'
import * as M from '../src/model/metrics.js'
import { dayKey, shiftMonth } from '../src/lib/time.js'

const base = { status: 'done', payment_status: 'paid', voided_at: null, deleted_at: null, client_source: 'inhouse', payment_method: 'cash', order_type: 'standard', price_adjustment: 0 }
const o = (id, at, total, extra = {}) => ({ ...base, id, order_number: id, created_at: at, total_amount: total, amount_paid: total, amount_due: 0, ...extra })

const raw = {
  orders: [
    o('a', '2026-11-01T00:30:00+01:00', 1000, { client_name: 'Walk-in Customer', order_type: 'quick_sale' }),
    o('b', '2026-11-02T10:00:00+01:00', 5000, { client_name: 'Amina', client_phone: '0555 12 34 56', customer_id: 7, amount_paid: 2000, amount_due: 3000, payment_status: 'partial', price_adjustment: -500 }),
    o('c', '2026-11-20T18:00:00+01:00', 3000, { client_name: 'amina', client_phone: '+213555123456', payment_method: 'baridimob', client_source: 'instagram' }),
    o('d', '2026-11-21T12:00:00+01:00', 9999, { status: 'cancelled' }),
    o('e', '2026-11-22T12:00:00+01:00', 7777, { voided_at: '2026-11-22T13:00:00Z' }),
    o('f', '2026-11-23T12:00:00+01:00', 4444, { payment_status: 'refunded' }),
    o('z', '2026-10-05T10:00:00+01:00', 4500, { customer_id: 7 }),
  ],
  items: [
    { id: 1, order_id: 'a', product_id: 1, product_name: 'RED ROSE', quantity: 2, unit_price: 500, total_price: 1000, category: null },
    { id: 2, order_id: 'b', product_id: 1, product_name: 'RED ROSE', quantity: 10, unit_price: 500, total_price: 5000, category: 'Flowers' },
    { id: 3, order_id: 'c', product_id: 2, product_name: 'Teddy', quantity: 1, unit_price: 3000, total_price: 3000, category: 'Gifts' },
    { id: 4, order_id: 'd', product_id: 2, product_name: 'Teddy', quantity: 3, unit_price: 3333, total_price: 9999, category: 'Gifts' },
    { id: 5, order_id: 'z', product_id: 1, product_name: 'RED ROSE', quantity: 9, unit_price: 500, total_price: 4500, category: 'Flowers' },
  ],
  products: [
    { product_id: 1, item_name: 'RED ROSE', category: 'Flowers', retail_price: 500, stock_level: 4, low_stock_threshold: 10, is_active: true },
    { product_id: 2, item_name: 'Teddy', category: 'Gifts', retail_price: 3000, stock_level: 99999, is_active: true },
  ],
  purchases: [
    { transaction_id: 1, product_id: 1, quantity: 100, unit_cost: 200, total_cost: 20000, transaction_date: '2026-11-01', transaction_type: 'purchase', supplier_id: 1 },
    { transaction_id: 2, product_id: 1, quantity: 100, unit_cost: 300, total_cost: 30000, transaction_date: '2026-11-10', transaction_type: 'purchase', supplier_id: 1 },
    { transaction_id: 3, product_id: 1, quantity: 1, unit_cost: 90000, total_cost: 90000, transaction_date: '2026-11-11', transaction_type: 'purchase', supplier_id: 1 },
  ],
  cash: [
    { id: 'x', transaction_type: 'cash_out', amount: 1000, category: 'Supplies', description: 'transport', register_date: '2026-11-03' },
    { id: 'y', transaction_type: 'cash_out', amount: 700, category: 'Refund', description: 'Refund ORDER #9', register_date: '2026-11-04' },
  ],
  suppliers: [{ supplier_id: 1, company_name: 'Khimisi' }],
  settings: [{ daily_target: 1000 }],
  profiles: [],
  waste: [],
  adjustments: [{ id: 1, product_id: 1, adjustment_type: 'removal', quantity: -3, reason: 'Wilted', created_at: '2026-11-05T10:00:00Z' }, { id: 2, product_id: 1, adjustment_type: 'removal', quantity: -2, reason: 'Order #9 created', created_at: '2026-11-05T10:00:00Z' }],
}

const ds = buildDataset(raw)
const nov = makePeriod('month', '2026-11')
const NOW = new Date('2026-12-02T12:00:00Z')

test('time and periods use shop time', () => {
  assert.equal(dayKey('2026-10-31T23:30:00Z'), '2026-11-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(previousPeriod(nov).value, '2026-10')
  const running = comparablePrevious(makePeriod('month', '2026-11'), new Date('2026-11-10T12:00:00Z'))
  assert.deepEqual([running.start, running.end, running.partial], ['2026-10-01', '2026-10-10', true])
})

test('only real sales count', () => {
  assert.equal(raw.orders.filter(isCounted).length, 4)
  assert.equal(customerKey(raw.orders[0]), 'walk-in')
})

test('one customer under a link and a phone is merged', () => {
  const b = ds.orders.find((x) => x.id === 'b')
  const c = ds.orders.find((x) => x.id === 'c')
  const z = ds.orders.find((x) => x.id === 'z')
  assert.equal(b.customer, c.customer)
  assert.equal(b.customer, z.customer)
})

test('costs come from purchases and ignore mistyped ones', () => {
  assert.equal(ds.products.get(1).cost, 250)
  assert.equal(ds.anomalies.length, 1)
})

test('summary, profit and discounts', () => {
  const s = M.summary(select(ds, nov))
  assert.equal(s.orders, 3)
  assert.equal(s.revenue, 9000)
  assert.equal(s.collected, 6000)
  assert.equal(s.due, 3000)
  assert.equal(s.cancelled, 3)
  assert.equal(s.itemsSold, 13)
  assert.equal(s.discounts, 500)
  assert.equal(s.cogs, 12 * 250)               // teddy has no cost
  assert.equal(s.grossProfit, 6000 - 3000)
  assert.equal(Math.round(s.costCoverage * 100), 67)
})

test('a product filter scopes values to that product', () => {
  const s = M.summary(select(ds, nov, { product: 1 }))
  assert.equal(s.revenue, 6000)
  assert.equal(s.orders, 2)
})

test('new vs returning and segments', () => {
  const mix = M.customerMix(ds, select(ds, nov))
  assert.deepEqual(mix, { newCustomers: 0, returning: 1 })
  const profiles = M.customerProfiles(ds, '2026-11-25')
  assert.equal(profiles.length, 1)
  assert.equal(profiles[0].count, 3)
  assert.equal(profiles[0].segment, 'loyal')
})

test('money: purchases, running costs, left', () => {
  const m = M.money(ds, select(ds, nov), nov)
  assert.equal(m.bought, 50000)                 // the 90 000 typo is left out
  assert.equal(m.spent, 1000)                   // refunds are not running costs
  assert.equal(m.left, 9000 - 50000 - 1000)
})

test('pace against target', () => {
  const p = M.pace(select(ds, nov), nov, 1000, NOW)
  assert.equal(p.target, 30000)
  assert.equal(p.running, false)
  assert.equal(p.projected, 9000)
})

test('stock statuses and waste', () => {
  const st = M.stock(ds, nov, { now: NOW })
  const rose = st.rows.find((r) => r.id === 1)
  const teddy = st.rows.find((r) => r.id === 2)
  assert.equal(teddy.status, 'untracked')
  assert.ok(['low', 'idle'].includes(rose.status))
  assert.equal(st.wasteQty, 3)                  // "Order #… created" removals are not waste
  assert.equal(st.wasteCost, 750)
})

test('timeline sums to the total', () => {
  const tl = M.timeline(select(ds, nov), nov)
  assert.equal(tl.rows.length, 30)
  assert.equal(tl.rows.at(-1).cumulative, 9000)
  assert.equal(tl.rows[0].revenue, 1000)
})

// ── Back office ─────────────────────────────────────────────
import { buildBackOffice, payroll, accounts, payables } from '../src/model/backoffice.js'
import { weekEnding } from '../src/model/period.js'

test('the shop week runs Saturday to Friday', () => {
  assert.equal(weekEnding('2026-11-27'), '2026-11-27') // Friday itself
  assert.equal(weekEnding('2026-11-21'), '2026-11-27') // Saturday starts the week
  assert.equal(weekEnding('2026-11-26'), '2026-11-27') // Thursday
  assert.equal(weekEnding('2026-11-28'), '2026-12-04') // next Saturday
  const w = makePeriod('week', '2026-11-27')
  assert.equal(w.start, '2026-11-21')
  assert.equal(w.end, '2026-11-27')
  assert.equal(previousPeriod(w).end, '2026-11-20')
})

const officeRaw = {
  ...raw,
  suppliers: [{ supplier_id: 1, company_name: 'Flora', supplier_status: 'active' }, { supplier_id: 2, company_name: 'Old', supplier_status: 'inactive' }],
  supplierPayments: [{ payment_id: 1, supplier_id: 1, amount: 15000, paid_at: '2026-11-05T10:00:00Z' }],
  supplierBalances: [{ supplier_id: 1, total_purchased: 50000, total_paid: 15000, total_due: 35000, credit: 0 }],
  bExpenses: [{ id: 1, spent_on: '2026-11-10', category: 'Rent', amount: 20000, payment_method: 'bank' }],
  staff: [
    { id: 1, full_name: 'Sara', monthly_salary: 30000, is_active: true, started_on: '2026-01-01' },
    { id: 2, full_name: 'Gone', monthly_salary: 25000, is_active: false, ended_on: '2026-09-30' },
  ],
  staffPayments: [
    { id: 1, staff_id: 1, kind: 'advance', for_month: '2026-11', amount: 5000, paid_on: '2026-11-12', from_register: false },
    { id: 2, staff_id: 1, kind: 'bonus', for_month: '2026-11', amount: 2000, paid_on: '2026-11-30', from_register: false },
    { id: 3, staff_id: 1, kind: 'deduction', for_month: '2026-11', amount: 1000, paid_on: '2026-11-30' },
    { id: 4, staff_id: 1, kind: 'salary', for_month: '2026-11', amount: 10000, paid_on: '2026-11-20', from_register: true },
  ],
  attendance: [{ staff_id: 1, day: '2026-11-02', status: 'present' }, { staff_id: 1, day: '2026-11-03', status: 'half' }, { staff_id: 1, day: '2026-11-04', status: 'absent' }],
  purchaseOrders: [{ id: 3, supplier_id: 1, status: 'sent', created_at: '2026-11-20T10:00:00Z' }],
  poLines: [{ id: 1, po_id: 3, product_id: 1, quantity: 50, unit_cost: 250 }],
}

test('suppliers use the database balance and keep inactive ones', () => {
  const ds = buildDataset(officeRaw)
  const bo = buildBackOffice(officeRaw, ds)
  const flora = bo.supplierById.get(1)
  assert.equal(flora.due, 35000)
  assert.equal(flora.payments.length, 1)
  assert.equal(bo.supplierById.get(2).active, false)
  assert.equal(payables(bo).total, 35000)
  assert.equal(bo.purchaseOrders[0].total, 12500)
  assert.equal(bo.purchaseOrders[0].number, 'PO-0003')
})

test('payroll: salary + bonus − deduction − advances − paid', () => {
  const bo = buildBackOffice(officeRaw, buildDataset(officeRaw))
  const sheet = payroll(bo, '2026-11')
  assert.equal(sheet.rows.length, 1) // the person who left in September is not on November's sheet
  const sara = sheet.rows[0]
  assert.equal(sara.earned, 31000)
  assert.equal(sara.handed, 15000)
  assert.equal(sara.owed, 16000)
  assert.equal(sara.attendance.worked, 1.5)
  assert.equal(sara.attendance.absent, 1)
  assert.equal(payroll(bo, '2026-09').rows.length, 2)
})

test('accounts never count till-paid staff twice', () => {
  const ds = buildDataset(officeRaw)
  const bo = buildBackOffice(officeRaw, ds)
  const nov = makePeriod('month', '2026-11')
  const acc = accounts(ds, bo, select(ds, nov), nov)
  assert.equal(acc.officeCosts, 20000)
  assert.equal(acc.staffCosts, 7000)      // advance + bonus; the salary came from the till, the deduction is not cash
  assert.equal(acc.staffFromTill, 10000)
  assert.equal(acc.tillCosts, 1000)       // refunds are not expenses
  assert.equal(acc.cash.suppliers, 15000)
  assert.equal(acc.cash.net, acc.collected - 15000 - 1000 - 20000 - 7000)
  assert.ok(acc.net < acc.gross)
})

test('Blossom logins not on the payroll are offered', () => {
  const r = { ...officeRaw, profiles: [{ id: 'u1', full_name: 'Owner', role: 'owner', is_active: true }, { id: 'u2', full_name: 'Sara', role: 'florist', is_active: true }, { id: 'u3', full_name: 'Old', role: 'cashier', is_active: false }], staff: [{ id: 1, full_name: 'Owner', profile_id: 'u1', monthly_salary: 0, is_active: true }] }
  const bo = buildBackOffice(r, buildDataset(r))
  assert.deepEqual(bo.team.map((t) => [t.name, t.onPayroll]), [['Owner', true], ['Sara', false]])
})
