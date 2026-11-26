// Line-by-line records: every money movement, every till day, every stock move.
// Pure: no network, no React. Unit-tested in scripts/model.test.mjs.

import { inPeriod } from './period.js'
import { dayKey } from '../lib/time.js'
import { PAY_KINDS, METHOD_LABEL } from './backoffice.js'
import { tillKind, TILL_KIND_LABEL } from './rules.js'

const num = (v) => Number(v) || 0
const sum = (list, f) => list.reduce((s, x) => s + (f(x) || 0), 0)

export const TILL_METHOD = { cash: 'Cash', baridimob: 'BaridiMob', usd: 'Cash (USD)', card: 'Card', transfer: 'Transfer' }
export const methodLabel = (m) => TILL_METHOD[m] || METHOD_LABEL[m] || (m ? m[0].toUpperCase() + m.slice(1) : '—')

export const SOURCES = {
  till: { label: 'Till', tone: 'muted' },
  supplier: { label: 'Supplier payment', tone: 'amber' },
  office: { label: 'Outside the till', tone: 'sky' },
  staff: { label: 'Staff pay', tone: 'plum' },
}

/** What kind of till line this is, in shop words (rules.js → shop_till_kind). */
const tillType = (c) => TILL_KIND_LABEL[tillKind(c)]

/**
 * Every money movement in the period, newest first.
 * amount is signed: + money in, − money out. counted=false lines are shown
 * but left out of totals (a staff payment already entered as a till cash-out).
 */
export function moneyLines(raw, ds, bo, period) {
  const orderNo = new Map(ds.orders.map((o) => [o.id, o.number]))
  const who = (id) => (id ? ds.staffName.get(id) || 'Unknown' : '')
  const lines = []

  for (const c of raw.cash || []) {
    if (c.transaction_type !== 'cash_in' && c.transaction_type !== 'cash_out') continue
    const day = c.register_date || dayKey(c.created_at)
    if (!inPeriod(day, period)) continue
    const out = c.transaction_type === 'cash_out'
    const qty = num(c.quantity)
    lines.push({
      key: `t${c.id}`, id: c.id, source: 'till', day, at: c.created_at || null,
      type: tillType(c), category: (c.category || '').trim() || (out ? 'Other' : 'Sales'),
      description: [String(c.description || '').trim(), qty > 1 && num(c.unit_price) ? `${qty} × ${num(c.unit_price)} DA` : ''].filter(Boolean).join(' · '),
      method: c.payment_method || 'cash', orderId: c.order_id || null, orderNumber: c.order_id ? orderNo.get(c.order_id) ?? null : null,
      who: who(c.created_by || c.user_id), amount: out ? -num(c.amount) : num(c.amount), counted: true,
    })
  }
  for (const p of bo.payments) {
    if (!inPeriod(p.day, period)) continue
    lines.push({
      key: `sp${p.id}`, id: p.id, source: 'supplier', day: p.day, at: null, type: 'Supplier payment',
      category: bo.supplierById.get(p.supplierId)?.name || 'Supplier', description: p.note, method: p.method,
      orderId: null, orderNumber: null, who: '', amount: -p.amount, counted: true,
    })
  }
  for (const e of raw.bExpenses || []) {
    if (!inPeriod(e.spent_on, period)) continue
    lines.push({
      key: `b${e.id}`, id: e.id, source: 'office', day: e.spent_on, at: e.created_at || null, type: 'Expense',
      category: e.category, description: e.description || '', method: e.payment_method || 'cash',
      orderId: null, orderNumber: null, who: who(e.created_by), amount: -num(e.amount), counted: true,
    })
  }
  for (const p of bo.staffPayments) {
    if (p.kind === 'deduction' || !inPeriod(p.day, period)) continue
    const person = bo.staff.find((s) => s.id === p.staffId)?.name || 'Staff'
    lines.push({
      key: `s${p.id}`, id: p.id, source: 'staff', day: p.day, at: null, type: PAY_KINDS[p.kind].label,
      category: person, description: [p.notes, p.fromRegister ? 'taken from the till: already counted there' : ''].filter(Boolean).join(' · '),
      method: p.method, orderId: null, orderNumber: null, who: '', amount: -p.amount, counted: !p.fromRegister,
    })
  }

  lines.sort((a, b) => b.day.localeCompare(a.day) || String(b.at || '').localeCompare(String(a.at || '')))
  return lines
}

export function totals(lines) {
  const counted = lines.filter((l) => l.counted)
  const moneyIn = sum(counted.filter((l) => l.amount > 0), (l) => l.amount)
  const moneyOut = -sum(counted.filter((l) => l.amount < 0), (l) => l.amount)
  return { in: moneyIn, out: moneyOut, net: moneyIn - moneyOut, count: lines.length }
}

/** Group money lines by a key, biggest first: [{ key, label, in, out, net, count }]. */
export function groupLines(lines, keyOf) {
  const map = new Map()
  for (const l of lines) {
    if (!l.counted) continue
    const k = keyOf(l) || '—'
    const g = map.get(k) || { key: k, label: k, in: 0, out: 0, count: 0 }
    if (l.amount > 0) g.in += l.amount; else g.out -= l.amount
    g.count += 1
    map.set(k, g)
  }
  return [...map.values()].map((g) => ({ ...g, net: g.in - g.out, revenue: g.out || g.in })).sort((a, b) => b.out + b.in - (a.out + a.in))
}

/**
 * The till, one row per day: opening float, money in and out, what the
 * closing count should have been, what was counted, and the difference.
 */
export function tillDays(raw, ds, period) {
  const who = (id) => (id ? ds.staffName.get(id) || 'Unknown' : '')
  const byDay = new Map()
  for (const c of raw.cash || []) {
    const day = c.register_date || dayKey(c.created_at)
    if (!inPeriod(day, period)) continue
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(c)
  }
  const days = [...byDay.entries()].map(([day, rows]) => {
    rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))
    const opening = rows.find((r) => r.transaction_type === 'opening')
    const closing = [...rows].reverse().find((r) => r.transaction_type === 'closing')
    const ins = rows.filter((r) => r.transaction_type === 'cash_in')
    const outs = rows.filter((r) => r.transaction_type === 'cash_out')
    const byMethod = {}
    for (const r of [...ins, ...outs]) {
      const m = r.payment_method || 'cash'
      byMethod[m] = (byMethod[m] || 0) + (r.transaction_type === 'cash_in' ? num(r.amount) : -num(r.amount))
    }
    const open = opening ? num(opening.amount) : null
    const moneyIn = sum(ins, (r) => num(r.amount))
    const moneyOut = sum(outs, (r) => num(r.amount))
    const expected = (open ?? 0) + moneyIn - moneyOut
    const banked = closing ? num(closing.banked_overnight) : sum(outs.filter((r) => /banked/i.test(`${r.category} ${r.description}`)), (r) => num(r.amount))
    const counted = closing && (closing.counted_cash != null || closing.counted_baridimob != null || closing.counted_usd != null)
      ? { cash: num(closing.counted_cash), baridimob: num(closing.counted_baridimob), usd: num(closing.counted_usd) } : null

    // Running balance through the day, line by line.
    let balance = 0
    const movements = rows.map((r) => {
      const t = r.transaction_type
      if (t === 'opening') balance = num(r.amount)
      else if (t === 'cash_in') balance += num(r.amount)
      else if (t === 'cash_out') balance -= num(r.amount)
      return {
        key: String(r.id), at: r.created_at, kind: t,
        type: t === 'opening' ? 'Opening float' : t === 'closing' ? 'Closing count' : tillType(r),
        category: r.category || '', description: r.description || '', method: r.payment_method || (t === 'opening' || t === 'closing' ? '' : 'cash'),
        orderId: r.order_id || null, who: who(r.created_by || r.user_id),
        amount: t === 'cash_out' ? -num(r.amount) : num(r.amount),
        balance: t === 'closing' ? num(r.amount) : balance,
      }
    })
    return {
      key: day, day, opening: open, openedBy: opening ? who(opening.created_by || opening.user_id) : '', openedAt: opening?.created_at || null,
      in: moneyIn, out: moneyOut, ins: ins.length, outs: outs.length, byMethod,
      expected, closing: closing ? num(closing.amount) : null, closedBy: closing ? who(closing.created_by || closing.user_id) : '', closedAt: closing?.created_at || null,
      banked, counted,
      // Closing amount is the float left after banking; banking is already one of the cash-outs.
      difference: closing ? num(closing.amount) - expected : null,
      movements,
    }
  })
  return days.sort((a, b) => b.day.localeCompare(a.day))
}

export const STOCK_TYPES = {
  received: { label: 'Delivery', tone: 'sage' },
  removal: { label: 'Removed', tone: 'rose' },
  sale: { label: 'Sold', tone: 'plum' },
  correction: { label: 'Count / correction', tone: 'amber' },
  count: { label: 'Count / correction', tone: 'amber' },
  adjustment: { label: 'Count / correction', tone: 'amber' },
  return: { label: 'Returned', tone: 'sky' },
}
export const stockType = (t) => STOCK_TYPES[t] || { label: t ? t[0].toUpperCase() + t.slice(1).replace(/_/g, ' ') : 'Change', tone: 'muted' }

/** Every stock movement in the period, newest first. */
export function stockMoves(raw, ds, period) {
  const who = (id) => (id ? ds.staffName.get(id) || 'Unknown' : '')
  const rows = []
  for (const a of raw.adjustments || []) {
    const day = dayKey(a.created_at)
    if (!inPeriod(day, period)) continue
    const product = ds.products.get(a.product_id)
    const before = a.previous_stock == null ? null : num(a.previous_stock)
    const after = a.new_stock == null ? null : num(a.new_stock)
    rows.push({
      key: `a${a.id}`, id: a.id, day, at: a.created_at, productId: a.product_id, name: product?.name || `Product ${a.product_id}`,
      type: a.adjustment_type || '', change: before != null && after != null ? after - before : (a.adjustment_type === 'removal' ? -Math.abs(num(a.quantity)) : num(a.quantity)),
      before, after, reason: a.reason || '', who: who(a.created_by),
      cost: product?.cost != null ? product.cost * Math.abs(before != null && after != null ? after - before : num(a.quantity)) : null,
    })
  }
  for (const w of raw.waste || []) {
    if (!inPeriod(w.waste_date || '', period)) continue
    const product = ds.products.get(w.product_id)
    rows.push({
      key: `w${w.id}`, id: w.id, day: w.waste_date, at: null, productId: w.product_id, name: product?.name || `Product ${w.product_id}`,
      type: 'waste', change: -num(w.quantity), before: null, after: null, reason: w.reason || 'Waste', who: who(w.created_by),
      cost: product?.cost != null ? product.cost * num(w.quantity) : null,
    })
  }
  return rows.sort((a, b) => b.day.localeCompare(a.day) || String(b.at || '').localeCompare(String(a.at || '')))
}
STOCK_TYPES.waste = { label: 'Waste', tone: 'rose' }
