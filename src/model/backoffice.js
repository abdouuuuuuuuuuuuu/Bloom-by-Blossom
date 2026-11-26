// Back-office figures: suppliers, purchase orders, payroll, accounts.
// Pure: no network, no React. Unit-tested in scripts/model.test.mjs.

import { inPeriod } from './period.js'
import { summary } from './metrics.js'
import { dayKey, daysInMonth, monthEnd, monthStart } from '../lib/time.js'

const num = (v) => Number(v) || 0
const sum = (list, f) => list.reduce((s, x) => s + (f(x) || 0), 0)

export const EXPENSE_CATEGORIES = [
  'Rent', 'Electricity & water', 'Internet & phone', 'Transport & fuel', 'Packaging & supplies',
  'Marketing', 'Maintenance & repairs', 'Equipment', 'Taxes & fees', 'Bank fees', 'Other',
]

export const METHODS = [['cash', 'Cash'], ['bank', 'Bank transfer'], ['ccp', 'CCP / BaridiMob'], ['card', 'Card'], ['cheque', 'Cheque'], ['other', 'Other']]
export const METHOD_LABEL = Object.fromEntries(METHODS)

export const PAY_KINDS = {
  salary: { label: 'Salary', tone: 'plum' },
  advance: { label: 'Advance', tone: 'amber' },
  bonus: { label: 'Bonus', tone: 'sage' },
  deduction: { label: 'Deduction', tone: 'rose' },
}

export const ATTENDANCE = {
  present: { label: 'Present', short: 'P', tone: 'sage', weight: 1 },
  half: { label: 'Half day', short: '½', tone: 'amber', weight: 0.5 },
  absent: { label: 'Absent', short: 'A', tone: 'rose', weight: 0 },
  leave: { label: 'Paid leave', short: 'L', tone: 'sky', weight: 1 },
  off: { label: 'Day off', short: '–', tone: 'muted', weight: 0 },
}

export const PO_STATUS = {
  draft: { label: 'Draft', tone: 'muted' },
  sent: { label: 'Ordered', tone: 'amber' },
  received: { label: 'Received', tone: 'sage' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
}

/**
 * Everything the back-office pages need, built once per data load.
 * @param raw  the rows from loadAll()
 * @param ds   the dataset from buildDataset()
 */
export function buildBackOffice(raw, ds) {
  // ── Suppliers ─────────────────────────────────────────────
  const balances = new Map((raw.supplierBalances || []).map((b) => [b.supplier_id, b]))
  const payments = (raw.supplierPayments || []).map((p) => {
    const at = p.paid_at || p.created_at
    return {
      id: p.payment_id, supplierId: p.supplier_id, amount: num(p.amount), method: p.payment_method || 'cash',
      note: p.notes || '', transactionId: p.transaction_id, day: at ? dayKey(at) : '',
    }
  })
  const suppliers = (raw.suppliers || []).map((s) => {
    const deliveries = ds.purchases.filter((p) => p.supplierId === s.supplier_id)
    const paid = payments.filter((p) => p.supplierId === s.supplier_id)
    const b = balances.get(s.supplier_id)
    const purchased = b ? num(b.total_purchased) : sum(deliveries, (p) => p.total)
    const paidTotal = b ? num(b.total_paid) : sum(paid, (p) => p.amount)
    const due = b ? num(b.total_due) : Math.max(purchased - paidTotal, 0)
    const days = deliveries.map((p) => p.day).sort()
    return {
      id: s.supplier_id,
      key: String(s.supplier_id),
      name: s.company_name || s.contact_person || `Supplier ${s.supplier_id}`,
      contact: s.contact_person || '', phone: s.phone || '', email: s.email || '', address: s.address || '', notes: s.notes || '',
      active: s.supplier_status !== 'inactive',
      raw: s,
      purchased, paid: paidTotal, due,
      credit: b ? num(b.credit) : Math.max(paidTotal - purchased, 0),
      deliveries: deliveries.sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id),
      payments: paid.sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id),
      lastDay: days.at(-1) || null,
      products: new Set(deliveries.map((p) => p.productId)).size,
    }
  }).sort((a, b) => Number(b.active) - Number(a.active) || b.due - a.due || a.name.localeCompare(b.name))
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))

  // ── Products, with what you last paid and to whom ─────────
  const lastPurchase = new Map()
  for (const p of [...ds.purchases].sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id)) if (!p.suspicious) lastPurchase.set(p.productId, p)
  const catalogue = [...ds.products.values()]
    .filter((p) => typeof p.id === 'number')
    .map((p) => {
      const last = lastPurchase.get(p.id)
      return {
        id: p.id, name: p.name, category: p.category, active: p.active, stock: p.stock, tracked: p.stockTracked,
        listPrice: p.listPrice, lowStock: p.lowStock, avgCost: p.cost,
        lastCost: last ? last.unitCost : null, lastSupplierId: last ? last.supplierId : p.supplierId ?? null, defaultSupplierId: p.supplierId ?? null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const productById = new Map(catalogue.map((p) => [p.id, p]))

  // ── Purchase orders ───────────────────────────────────────
  const linesByPo = new Map()
  for (const l of raw.poLines || []) {
    const product = productById.get(l.product_id)
    const line = { id: l.id, productId: l.product_id, name: product?.name || `Product ${l.product_id}`, quantity: num(l.quantity), unitCost: num(l.unit_cost) }
    line.total = line.quantity * line.unitCost
    ;(linesByPo.get(l.po_id) || linesByPo.set(l.po_id, []).get(l.po_id)).push(line)
  }
  const purchaseOrders = (raw.purchaseOrders || []).map((po) => {
    const lines = linesByPo.get(po.id) || []
    return {
      id: po.id, key: String(po.id), number: `PO-${String(po.id).padStart(4, '0')}`,
      supplierId: po.supplier_id, supplier: supplierById.get(po.supplier_id)?.name || 'Unknown supplier',
      status: po.status, expectedOn: po.expected_on, notes: po.notes || '',
      day: dayKey(po.created_at), sentDay: po.sent_at ? dayKey(po.sent_at) : null, receivedDay: po.received_at ? dayKey(po.received_at) : null,
      lines, total: sum(lines, (l) => l.total), units: sum(lines, (l) => l.quantity),
    }
  }).sort((a, b) => b.id - a.id)

  // ── Expenses paid outside the till ────────────────────────
  const backExpenses = (raw.bExpenses || []).map((e) => ({
    id: e.id, key: `b${e.id}`, day: e.spent_on, month: String(e.spent_on).slice(0, 7), category: e.category, description: e.description || '',
    amount: num(e.amount), method: e.payment_method || 'cash', supplierId: e.supplier_id, source: 'office',
  })).sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id)

  // ── Staff ─────────────────────────────────────────────────
  const profileById = new Map((raw.profiles || []).map((p) => [p.id, p]))
  const staffPayments = (raw.staffPayments || []).map((p) => ({
    id: p.id, key: String(p.id), staffId: p.staff_id, kind: p.kind, month: p.for_month, amount: num(p.amount),
    day: p.paid_on, method: p.payment_method || 'cash', fromRegister: !!p.from_register, notes: p.notes || '',
  })).sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id)
  const attendance = new Map()
  for (const a of raw.attendance || []) attendance.set(`${a.staff_id}|${a.day}`, { status: a.status, note: a.note || '' })
  const staff = (raw.staff || []).map((s) => {
    const profile = s.profile_id ? profileById.get(s.profile_id) : null
    return {
      id: s.id, key: String(s.id), name: s.full_name, jobTitle: s.job_title || '', phone: s.phone || '',
      profileId: s.profile_id, login: profile ? (profile.username || profile.full_name) : null,
      salary: num(s.monthly_salary), startedOn: s.started_on, endedOn: s.ended_on, active: s.is_active !== false,
      notes: s.notes || '', raw: s,
      payments: staffPayments.filter((p) => p.staffId === s.id),
    }
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))

  return { suppliers, supplierById, payments, catalogue, productById, purchaseOrders, backExpenses, staff, staffPayments, attendance }
}

/** Was this person on the payroll during the month? */
export function employedIn(person, month) {
  if (person.startedOn && person.startedOn > monthEnd(month)) return false
  if (person.endedOn && person.endedOn < monthStart(month)) return false
  return person.active || (person.endedOn && person.endedOn >= monthStart(month))
}

/**
 * Pay sheet for one month: what each person earns, what they already got,
 * and what is still owed (negative = paid too much, carry it over).
 */
export function payroll(bo, month) {
  const rows = bo.staff.filter((s) => employedIn(s, month)).map((s) => {
    const list = s.payments.filter((p) => p.month === month)
    const by = (k) => sum(list.filter((p) => p.kind === k), (p) => p.amount)
    const att = attendanceSummary(bo, s.id, month)
    const salary = s.salary
    const bonus = by('bonus')
    const deduction = by('deduction')
    const advance = by('advance')
    const paid = by('salary')
    const earned = salary + bonus - deduction
    return {
      key: s.key, id: s.id, person: s, name: s.name, jobTitle: s.jobTitle,
      salary, bonus, deduction, advance, paid, earned,
      handed: advance + paid,
      owed: earned - advance - paid,
      attendance: att,
      // One day of base salary, on a 26-working-day month (common in Algeria).
      dayRate: salary ? salary / 26 : 0,
    }
  })
  return {
    rows,
    earned: sum(rows, (r) => r.earned),
    handed: sum(rows, (r) => r.handed),
    owed: sum(rows, (r) => Math.max(r.owed, 0)),
    overpaid: sum(rows, (r) => Math.max(-r.owed, 0)),
  }
}

export function attendanceSummary(bo, staffId, month) {
  const counts = { present: 0, half: 0, absent: 0, leave: 0, off: 0, marked: 0 }
  for (let d = 1; d <= daysInMonth(month); d++) {
    const a = bo.attendance.get(`${staffId}|${month}-${String(d).padStart(2, '0')}`)
    if (a) { counts[a.status] += 1; counts.marked += 1 }
  }
  counts.worked = counts.present + counts.half * 0.5
  return counts
}

/**
 * Profit and loss for a period.
 * Profit uses what the flowers sold cost (average supplier price); cash flow
 * uses money that actually moved. Both leave out anything recorded twice:
 * staff payments taken from the till are already in the till's cash-outs.
 */
export function accounts(ds, bo, sel, period) {
  const s = summary(sel)
  const till = ds.expenses.filter((e) => e.isExpense && inPeriod(e.day, period))
  const office = bo.backExpenses.filter((e) => inPeriod(e.day, period))
  const staffPaid = bo.staffPayments.filter((p) => p.kind !== 'deduction' && inPeriod(p.day, period))
  const staffCost = staffPaid.filter((p) => !p.fromRegister)
  const waste = ds.waste.filter((w) => inPeriod(w.day, period))
  const purchases = ds.purchases.filter((p) => inPeriod(p.day, period) && !p.suspicious)
  const supplierPaid = bo.payments.filter((p) => inPeriod(p.day, period))

  const cogs = s.revenue - (s.estGrossProfit ?? s.revenue)
  const gross = s.estGrossProfit
  const wasteCost = sum(waste, (w) => w.cost)
  const tillCosts = sum(till, (e) => e.amount)
  const officeCosts = sum(office, (e) => e.amount)
  const staffCosts = sum(staffCost, (p) => p.amount)
  const operating = tillCosts + officeCosts + staffCosts + wasteCost
  const net = gross == null ? null : gross - operating

  const categories = new Map()
  const add = (cat, amount, source) => {
    const k = cat.toLowerCase()
    const c = categories.get(k) || { key: k, label: cat, revenue: 0, till: 0, office: 0, orders: 0 }
    c.revenue += amount; c[source] += amount; c.orders += 1
    categories.set(k, c)
  }
  for (const e of till) add(e.category, e.amount, 'till')
  for (const e of office) add(e.category, e.amount, 'office')
  if (staffCosts) categories.set('__staff', { key: '__staff', label: 'Staff pay (outside the till)', revenue: staffCosts, till: 0, office: staffCosts, orders: staffCost.length })

  return {
    sales: s.revenue, collected: s.collected, cogs, gross, grossMargin: s.revenue && gross != null ? gross / s.revenue : null,
    wasteCost, tillCosts, officeCosts, staffCosts, staffFromTill: sum(staffPaid.filter((p) => p.fromRegister), (p) => p.amount),
    operating, net, netMargin: s.revenue && net != null ? net / s.revenue : null,
    costCoverage: s.costCoverage,
    cash: {
      in: s.collected,
      suppliers: sum(supplierPaid, (p) => p.amount),
      till: tillCosts, office: officeCosts, staff: staffCosts,
      get net() { return this.in - this.suppliers - this.till - this.office - this.staff },
    },
    purchased: sum(purchases, (p) => p.total),
    categories: [...categories.values()].sort((a, b) => b.revenue - a.revenue),
    lines: [
      ...till.map((e) => ({ ...e, key: `t${e.id}`, source: 'till' })),
      ...office,
      ...staffCost.map((p) => ({ key: `s${p.id}`, id: p.id, day: p.day, category: 'Staff pay', description: `${PAY_KINDS[p.kind].label} · ${bo.staff.find((x) => x.id === p.staffId)?.name || 'Staff'}`, amount: p.amount, method: p.method, source: 'staff' })),
    ].sort((a, b) => b.day.localeCompare(a.day)),
  }
}

/** Who you owe, oldest debt first. */
export function payables(bo) {
  const owing = bo.suppliers.filter((s) => s.due > 0)
  return { total: sum(owing, (s) => s.due), suppliers: owing.sort((a, b) => b.due - a.due) }
}
