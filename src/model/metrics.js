// Every number Bloom shows is computed here, from a selection (see filters.js).
// Pure functions, unit-tested in scripts/model.test.mjs.

import { select, valueOf } from './filters.js'
import { elapsedDays, grainOf, inPeriod, isRunning, totalDays } from './period.js'
import {
  addDays, daysBetween, eachDay, eachMonth, monthShort, shiftMonth, today, WEEKDAYS, dayLabel,
} from '../lib/time.js'

const sum = (list, f) => list.reduce((s, x) => s + (f(x) || 0), 0)

function group(list, keyOf, init) {
  const map = new Map()
  for (const x of list) {
    const k = keyOf(x)
    if (!map.has(k)) map.set(k, init(k, x))
    map.get(k).list.push(x)
  }
  return map
}

// ── Headline numbers ──────────────────────────────────────────
export function summary(sel) {
  const { counted, orders, items } = sel
  const revenue = sum(counted, valueOf)
  const fullValue = sum(counted, (o) => o.value)
  const share = fullValue ? revenue / fullValue : 0       // < 1 when an item filter is on
  const itemValue = sum(items, (i) => i.value)
  const costed = items.filter((i) => i.cost != null)
  const costedValue = sum(costed, (i) => i.value)
  const cogs = sum(costed, (i) => i.cost)
  const marginPct = costedValue ? (costedValue - cogs) / costedValue : null
  const cancelledOrders = orders.filter((o) => !o.counted)
  const named = new Set(counted.filter((o) => o.customer !== 'walk-in').map((o) => o.customer))
  return {
    revenue,
    orders: counted.length,
    avgOrder: counted.length ? revenue / counted.length : 0,
    itemsSold: sum(items, (i) => i.qty),
    productsSold: new Set(items.map((i) => i.productId)).size,
    collected: sum(counted, (o) => o.paid) * share,
    due: sum(counted, (o) => o.due) * share,
    discounts: sel.itemScoped ? 0 : sum(counted, (o) => o.discount),
    extras: sel.itemScoped ? 0 : sum(counted, (o) => o.extra),
    cancelled: cancelledOrders.length,
    cancelledValue: sum(cancelledOrders, valueOf),
    customers: named.size,
    walkInOrders: counted.filter((o) => o.customer === 'walk-in').length,
    itemValue,
    costedValue,
    cogs,
    grossProfit: costedValue - cogs,
    marginPct,
    costCoverage: itemValue ? costedValue / itemValue : null,
    // Profit on everything sold, assuming un-costed items earn the same margin.
    estGrossProfit: marginPct == null ? null : revenue * marginPct,
  }
}

/** New vs returning named customers in the selection. */
export function customerMix(ds, sel) {
  const seen = new Set(sel.counted.filter((o) => o.customer !== 'walk-in').map((o) => o.customer))
  let fresh = 0
  for (const key of seen) {
    const c = ds.customers.get(key)
    if (c && inPeriod(c.first, sel.period)) fresh += 1
  }
  return { newCustomers: fresh, returning: seen.size - fresh }
}

// ── Target & pace ─────────────────────────────────────────────
export function pace(sel, period, dailyTarget, now = new Date()) {
  const days = totalDays(period)
  const elapsed = elapsedDays(period, now)
  const revenue = sum(sel.counted, valueOf)
  const target = dailyTarget * days
  const running = isRunning(period, now)
  const perDay = elapsed ? revenue / elapsed : 0
  const projected = running ? perDay * days : revenue
  const remainingDays = running ? days - elapsed : 0
  const neededPerDay = remainingDays > 0 ? Math.max(target - revenue, 0) / remainingDays : 0
  return { target, revenue, projected, perDay, elapsed, days, running, remainingDays, neededPerDay, progress: target ? revenue / target : null }
}

// ── Over time ─────────────────────────────────────────────────
export function timeline(sel, period, dailyTarget = 0) {
  const grain = grainOf(period)
  const keys = grain === 'day' ? eachDay(period.start, period.end) : eachMonth(period.start.slice(0, 7), period.end.slice(0, 7))
  const rows = new Map(keys.map((k) => [k, {
    key: k,
    label: grain === 'day' ? String(Number(k.slice(8, 10))) : monthShort(k),
    title: grain === 'day' ? dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long' }) : monthShort(k) + ' ' + k.slice(0, 4),
    revenue: 0, orders: 0, profit: 0, target: grain === 'day' ? dailyTarget : 0,
  }]))
  for (const o of sel.counted) {
    const r = rows.get(grain === 'day' ? o.day : o.month)
    if (r) { r.revenue += valueOf(o); r.orders += 1 }
  }
  let running = 0
  for (const r of rows.values()) { running += r.revenue; r.cumulative = running }
  return { grain, rows: [...rows.values()] }
}

/** One row per month for the last `count` months up to `endMonth`. */
export function monthlyHistory(ds, endMonth, count = 12, filters = {}) {
  const first = ds.firstDay ? ds.firstDay.slice(0, 7) : endMonth
  const months = eachMonth(shiftMonth(endMonth, -(count - 1)), endMonth).filter((m) => m >= first)
  return months.map((m) => {
    const period = { start: `${m}-01`, end: `${m}-31` }
    const sel = select(ds, period, filters)
    const s = summary(sel)
    const purchases = sum(ds.purchases.filter((p) => p.month === m && !p.suspicious), (p) => p.total)
    const expenses = sum(ds.expenses.filter((e) => e.month === m && e.isExpense), (e) => e.amount)
    return {
      key: m, label: monthShort(m), title: `${monthShort(m)} ${m.slice(0, 4)}`,
      revenue: s.revenue, orders: s.orders, avgOrder: s.avgOrder, customers: s.customers,
      grossProfit: s.estGrossProfit ?? 0, marginPct: s.marginPct,
      purchases, expenses, left: s.revenue - purchases - expenses,
    }
  })
}

/** 7 weekdays × 24 hours. */
export function heatmap(sel) {
  const grid = WEEKDAYS.map((day, d) => ({ day, d, hours: Array.from({ length: 24 }, (_, h) => ({ h, orders: 0, revenue: 0 })) }))
  for (const o of sel.counted) {
    if (o.hour == null) continue
    const cell = grid[o.weekday].hours[o.hour]
    cell.orders += 1
    cell.revenue += valueOf(o)
  }
  const active = new Set()
  grid.forEach((row) => row.hours.forEach((c) => c.orders && active.add(c.h)))
  const hours = active.size ? [...active].sort((a, b) => a - b) : []
  const from = hours[0] ?? 8
  const to = hours.at(-1) ?? 20
  const max = Math.max(1, ...grid.flatMap((r) => r.hours.map((c) => c.revenue)))
  return { grid, from, to, max }
}

export function weekdays(sel, period) {
  const counts = Array(7).fill(0)
  for (const d of eachDay(period.start, period.end < today() ? period.end : today())) counts[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7] += 1
  const rows = WEEKDAYS.map((day, i) => ({ key: i, label: day, revenue: 0, orders: 0, days: counts[i] }))
  for (const o of sel.counted) { rows[o.weekday].revenue += valueOf(o); rows[o.weekday].orders += 1 }
  for (const r of rows) r.perDay = r.days ? r.revenue / r.days : 0
  return rows
}

export function hours(sel) {
  const rows = Array.from({ length: 24 }, (_, h) => ({ key: h, label: `${h}h`, revenue: 0, orders: 0 }))
  for (const o of sel.counted) if (o.hour != null) { rows[o.hour].revenue += valueOf(o); rows[o.hour].orders += 1 }
  const first = rows.findIndex((r) => r.orders)
  const last = 23 - [...rows].reverse().findIndex((r) => r.orders)
  return first < 0 ? rows.slice(8, 21) : rows.slice(first, last + 1)
}

// ── Breakdowns ────────────────────────────────────────────────
export function breakdown(sel, keyOf, labelOf) {
  const total = sum(sel.counted, valueOf)
  const rows = [...group(sel.counted, keyOf, (k, o) => ({ key: k, label: labelOf(k, o), list: [] })).values()]
    .map((g) => {
      const revenue = sum(g.list, valueOf)
      return { key: g.key, label: g.label, orders: g.list.length, revenue, avg: revenue / g.list.length, share: total ? revenue / total : 0 }
    })
  return rows.sort((a, b) => b.revenue - a.revenue)
}

export function itemBreakdown(sel, keyOf) {
  const total = sum(sel.items, (i) => i.value)
  const rows = [...group(sel.items.filter((i) => keyOf(i)), keyOf, (k) => ({ key: k, label: k, list: [] })).values()]
    .map((g) => {
      const revenue = sum(g.list, (i) => i.value)
      const costed = g.list.filter((i) => i.cost != null)
      const cv = sum(costed, (i) => i.value)
      return {
        key: g.key, label: g.label, qty: sum(g.list, (i) => i.qty), revenue, share: total ? revenue / total : 0,
        marginPct: cv ? (cv - sum(costed, (i) => i.cost)) / cv : null,
        orders: new Set(g.list.map((i) => i.order.id)).size,
      }
    })
  return rows.sort((a, b) => b.revenue - a.revenue)
}

export const BASKETS = [
  { key: 'b1', label: 'Under 1 000', min: 0, max: 999 },
  { key: 'b2', label: '1 000 – 2 499', min: 1000, max: 2499 },
  { key: 'b3', label: '2 500 – 4 999', min: 2500, max: 4999 },
  { key: 'b4', label: '5 000 – 9 999', min: 5000, max: 9999 },
  { key: 'b5', label: '10 000 and more', min: 10000, max: Infinity },
]
export function basketSizes(sel) {
  const total = sum(sel.counted, valueOf)
  return BASKETS.map((b) => {
    const list = sel.counted.filter((o) => valueOf(o) >= b.min && valueOf(o) <= b.max)
    const revenue = sum(list, valueOf)
    return { key: b.key, label: b.label, orders: list.length, revenue, share: total ? revenue / total : 0 }
  })
}

// ── Products ──────────────────────────────────────────────────
/** Average units sold per day over the last `days` days (stock planning). */
export function dailyRates(ds, days = 30, now = new Date()) {
  const end = today(now)
  const start = addDays(end, -(days - 1))
  const rates = new Map()
  for (const o of ds.orders) {
    if (!o.counted || o.day < start || o.day > end) continue
    for (const i of o.items) rates.set(i.productId, (rates.get(i.productId) || 0) + i.qty)
  }
  for (const [k, v] of rates) rates.set(k, v / days)
  return rates
}

export function lastSold(ds) {
  const last = new Map()
  for (const o of ds.orders) if (o.counted) for (const i of o.items) last.set(i.productId, o.day)
  return last
}

export function productRows(ds, sel, prevSel, { now = new Date(), coverDays = 14 } = {}) {
  const total = sum(sel.items, (i) => i.value)
  const prev = new Map()
  for (const i of prevSel?.items || []) prev.set(i.productId, (prev.get(i.productId) || 0) + i.value)
  const rates = dailyRates(ds, 30, now)
  const last = lastSold(ds)
  const endMonth = sel.period.end.slice(0, 7)
  const months = eachMonth(shiftMonth(endMonth, -5), endMonth)

  const rows = [...group(sel.items, (i) => i.productId, (k) => ({ key: k, list: [] })).values()].map((g) => {
    const p = g.list[0].product
    const qty = sum(g.list, (i) => i.qty)
    const revenue = sum(g.list, (i) => i.value)
    const cogs = p.cost == null ? null : p.cost * qty
    const avgPrice = qty ? revenue / qty : 0
    const rate = rates.get(p.id) || 0
    const spark = months.map((m) => 0)
    for (const o of ds.orders) {
      if (!o.counted) continue
      const idx = months.indexOf(o.month)
      if (idx < 0) continue
      for (const i of o.items) if (i.productId === p.id) spark[idx] += i.qty
    }
    return {
      key: String(p.id), id: p.id, product: p, name: p.name, category: g.list[0].category, flower: g.list[0].flower,
      image: g.list[0].image, qty, revenue, share: total ? revenue / total : 0,
      orders: new Set(g.list.map((i) => i.order.id)).size,
      customers: new Set(g.list.map((i) => i.order.customer).filter((c) => c !== 'walk-in')).size,
      unitCost: p.cost, costSource: p.costSource, cogs, profit: cogs == null ? null : revenue - cogs,
      marginPct: cogs == null || !revenue ? null : (revenue - cogs) / revenue,
      avgPrice, listPrice: p.listPrice,
      discountPct: p.listPrice > 0 && avgPrice > 0 ? 1 - avgPrice / p.listPrice : null,
      prevRevenue: prev.get(p.id) || 0,
      change: prev.get(p.id) ? (revenue - prev.get(p.id)) / prev.get(p.id) : null,
      stock: p.stock, stockTracked: p.stockTracked,
      perDay: rate,
      daysCover: p.stockTracked && rate > 0 ? Math.max(p.stock, 0) / rate : null,
      reorder: p.stockTracked && rate > 0 ? Math.max(Math.ceil(rate * coverDays - Math.max(p.stock, 0)), 0) : 0,
      lastSold: last.get(p.id) || null,
      spark,
    }
  })
  return rows.sort((a, b) => b.revenue - a.revenue)
}

/** Products that go out together in the same order. */
export function boughtTogether(sel, limit = 12) {
  const pairs = new Map()
  const orderCount = new Map()
  const multi = sel.counted.filter((o) => new Set(o.items.map((i) => i.productId)).size > 1)
  for (const o of multi) {
    const ids = [...new Map(o.items.map((i) => [i.productId, i.product])).values()].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    for (const p of ids) orderCount.set(p.id, (orderCount.get(p.id) || 0) + 1)
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const key = `${ids[a].id}|${ids[b].id}`
        if (!pairs.has(key)) pairs.set(key, { key, a: ids[a], b: ids[b], orders: 0 })
        pairs.get(key).orders += 1
      }
    }
  }
  return {
    multiShare: sel.counted.length ? multi.length / sel.counted.length : 0,
    pairs: [...pairs.values()]
      .map((p) => ({ ...p, ofA: p.orders / orderCount.get(p.a.id) }))
      .sort((x, y) => y.orders - x.orders)
      .slice(0, limit),
  }
}

/** Active products with nothing sold for `days` days. */
export function slowMovers(ds, days = 30, now = new Date()) {
  const cutoff = addDays(today(now), -days)
  const last = lastSold(ds)
  return [...ds.products.values()]
    .filter((p) => p.active && typeof p.id === 'number' && (!last.get(p.id) || last.get(p.id) < cutoff))
    .map((p) => ({ key: String(p.id), product: p, name: p.name, category: p.category, lastSold: last.get(p.id) || null, stock: p.stock, stockTracked: p.stockTracked, idleDays: last.get(p.id) ? daysBetween(last.get(p.id), today(now)) : null, tiedUp: p.stockTracked && p.cost != null ? Math.max(p.stock, 0) * p.cost : null }))
    .sort((a, b) => (a.lastSold || '').localeCompare(b.lastSold || ''))
}

// ── Customers ─────────────────────────────────────────────────
export const SEGMENTS = {
  champion: { label: 'Champions', tone: 'plum', hint: '4+ orders, bought in the last 30 days' },
  loyal: { label: 'Loyal', tone: 'sage', hint: '2+ orders, bought in the last 45 days' },
  new: { label: 'New', tone: 'sky', hint: 'First order in the last 30 days' },
  risk: { label: 'At risk', tone: 'amber', hint: '2+ orders, but nothing for 46–90 days' },
  once: { label: 'One-time', tone: 'muted', hint: 'One order, more than 30 days ago' },
  lost: { label: 'Lost', tone: 'rose', hint: 'Nothing for more than 90 days' },
}

export function segmentOf(count, first, last, asOf) {
  const since = daysBetween(last, asOf)
  if (since > 90) return 'lost'
  if (count >= 4 && since <= 30) return 'champion'
  if (count >= 2 && since <= 45) return 'loyal'
  if (count >= 2) return 'risk'
  if (daysBetween(first, asOf) <= 30) return 'new'
  return 'once'
}

/** Every named customer's lifetime picture as of a day. */
export function customerProfiles(ds, asOf) {
  const out = []
  for (const c of ds.customers.values()) {
    const orders = c.orders.filter((o) => o.day <= asOf)
    if (!orders.length) continue
    const first = orders[0].day
    const last = orders.at(-1).day
    const value = sum(orders, (o) => o.value)
    const gaps = orders.slice(1).map((o, i) => daysBetween(orders[i].day, o.day)).filter((g) => g > 0)
    const fav = new Map()
    for (const o of orders) for (const i of o.items) fav.set(i.name, (fav.get(i.name) || 0) + i.qty)
    const channels = new Map()
    for (const o of orders) channels.set(o.channel, (channels.get(o.channel) || 0) + 1)
    out.push({
      key: c.key, name: c.name, phone: c.phone, orders, count: orders.length, value,
      avgOrder: value / orders.length, first, last, daysSince: daysBetween(last, asOf),
      avgGap: gaps.length ? sum(gaps, (g) => g) / gaps.length : null,
      due: sum(orders.filter((o) => o.counted), (o) => o.due),
      segment: segmentOf(orders.length, first, last, asOf),
      favorites: [...fav.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty })),
      channel: [...channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'inhouse',
    })
  }
  return out
}

export function segments(profiles) {
  const total = sum(profiles, (p) => p.value)
  return Object.entries(SEGMENTS).map(([key, def]) => {
    const list = profiles.filter((p) => p.segment === key)
    return { key, ...def, count: list.length, value: sum(list, (p) => p.value), share: total ? sum(list, (p) => p.value) / total : 0 }
  })
}

export function loyaltyStats(profiles) {
  const repeat = profiles.filter((p) => p.count >= 2)
  const gaps = profiles.map((p) => p.avgGap).filter((g) => g != null)
  return {
    customers: profiles.length,
    repeatRate: profiles.length ? repeat.length / profiles.length : 0,
    avgLifetimeValue: profiles.length ? sum(profiles, (p) => p.value) / profiles.length : 0,
    avgGap: gaps.length ? sum(gaps, (g) => g) / gaps.length : null,
    repeatValueShare: sum(profiles, (p) => p.value) ? sum(repeat, (p) => p.value) / sum(profiles, (p) => p.value) : 0,
  }
}

/** Customers who bought in the selection, with their period numbers. */
export function periodCustomers(sel, profilesByKey) {
  const rows = [...group(sel.counted, (o) => o.customer, (k, o) => ({ key: k, list: [], name: o.clientName, phone: o.clientPhone })).values()]
  return rows.map((g) => {
    const profile = profilesByKey.get(g.key)
    const items = new Map()
    for (const o of g.list) for (const i of (o.matchedItems || o.items)) items.set(i.name, (items.get(i.name) || 0) + i.qty)
    return {
      key: g.key,
      name: g.key === 'walk-in' ? 'Walk-in customers' : profile?.name || g.name || 'Unnamed customer',
      phone: g.key === 'walk-in' ? '' : profile?.phone || g.phone,
      orders: g.list.length,
      revenue: sum(g.list, valueOf),
      due: sum(g.list, (o) => o.due),
      last: g.list.at(-1).day,
      segment: profile?.segment || null,
      lifetime: profile?.value || null,
      lifetimeOrders: profile?.count || null,
      isNew: profile ? inPeriod(profile.first, sel.period) : null,
      products: [...items.entries()].sort((a, b) => b[1] - a[1]).map(([name, qty]) => ({ name, qty })),
    }
  }).sort((a, b) => b.revenue - a.revenue)
}

// ── Money ─────────────────────────────────────────────────────
export function money(ds, sel, period) {
  const s = summary(sel)
  const purchases = ds.purchases.filter((p) => inPeriod(p.day, period))
  const goodPurchases = purchases.filter((p) => !p.suspicious)
  const expenses = ds.expenses.filter((e) => inPeriod(e.day, period))
  const running = expenses.filter((e) => e.isExpense)
  const bought = sum(goodPurchases, (p) => p.total)
  const spent = sum(running, (e) => e.amount)
  const bySupplier = [...group(goodPurchases, (p) => p.supplierId, (k, p) => ({ key: k, label: p.supplier, list: [] })).values()]
    .map((g) => ({ key: g.key, label: g.label, revenue: sum(g.list, (p) => p.total), orders: g.list.length, due: sum(g.list, (p) => p.due) }))
    .sort((a, b) => b.revenue - a.revenue)
  const byCategory = [...group(running, (e) => e.category, (k) => ({ key: k, label: k, list: [] })).values()]
    .map((g) => ({ key: g.key, label: g.label, revenue: sum(g.list, (e) => e.amount), orders: g.list.length }))
    .sort((a, b) => b.revenue - a.revenue)
  const boughtByProduct = [...group(goodPurchases, (p) => p.productId, (k, p) => ({ key: k, label: p.product.name, list: [] })).values()]
    .map((g) => ({ key: g.key, label: g.label, revenue: sum(g.list, (p) => p.total), qty: sum(g.list, (p) => p.qty), orders: g.list.length, avgCost: sum(g.list, (p) => p.total) / Math.max(sum(g.list, (p) => p.qty), 1) }))
    .sort((a, b) => b.revenue - a.revenue)
  return {
    sales: s.revenue,
    collected: s.collected,
    owedToYou: s.due,
    bought,
    spent,
    refunds: sum(expenses.filter((e) => !e.isExpense && /refund/i.test(e.category + e.description)), (e) => e.amount),
    left: s.revenue - bought - spent,
    leftCash: s.collected - sum(goodPurchases, (p) => p.paid) - spent,
    grossProfit: s.estGrossProfit,
    marginPct: s.marginPct,
    purchases,
    expenses,
    bySupplier,
    byCategory,
    boughtByProduct,
    suspicious: purchases.filter((p) => p.suspicious),
  }
}

/** Money customers still owe, by how old the order is. */
export function receivables(ds, now = new Date()) {
  const t = today(now)
  const open = ds.orders.filter((o) => o.counted && o.due > 0)
  const buckets = [
    { key: 'a', label: 'This week', min: 0, max: 7 },
    { key: 'b', label: '8–30 days', min: 8, max: 30 },
    { key: 'c', label: '31–60 days', min: 31, max: 60 },
    { key: 'd', label: 'Over 60 days', min: 61, max: Infinity },
  ].map((b) => {
    const list = open.filter((o) => { const age = daysBetween(o.day, t); return age >= b.min && age <= b.max })
    return { ...b, orders: list.length, revenue: sum(list, (o) => o.due) }
  })
  return { total: sum(open, (o) => o.due), orders: open.sort((a, b) => a.day.localeCompare(b.day)), buckets }
}

export function supplierBills(ds) {
  const open = ds.purchases.filter((p) => p.due > 0)
  return { total: sum(open, (p) => p.due), list: open.sort((a, b) => a.day.localeCompare(b.day)) }
}

// ── Operations ────────────────────────────────────────────────
export function operations(sel, now = new Date()) {
  const t = today(now)
  const scheduled = sel.counted.filter((o) => o.type === 'order' && o.deliveryDate)
  const delivered = scheduled.filter((o) => o.deliveredDay)
  const onTime = delivered.filter((o) => o.deliveredDay <= o.deliveryDate)
  const overdue = scheduled.filter((o) => o.deliveryDate < t && o.status !== 'done' && !o.deliveredDay)
  const lead = [
    { key: 'same', label: 'Same day', min: 0, max: 0 },
    { key: 'next', label: 'Next day', min: 1, max: 1 },
    { key: 'few', label: '2–3 days', min: 2, max: 3 },
    { key: 'week', label: '4–7 days', min: 4, max: 7 },
    { key: 'long', label: '8+ days', min: 8, max: Infinity },
  ].map((b) => {
    const list = scheduled.filter((o) => { const d = daysBetween(o.day, o.deliveryDate); return d >= b.min && d <= b.max })
    return { ...b, orders: list.length, revenue: sum(list, valueOf) }
  })
  const delayed = scheduled.filter((o) => o.delays > 0 || (o.originalDeliveryDate && o.originalDeliveryDate !== o.deliveryDate))
  const cancelled = sel.orders.filter((o) => !o.counted)
  return {
    scheduled: scheduled.length,
    delivered: delivered.length,
    onTime: onTime.length,
    onTimeRate: delivered.length ? onTime.length / delivered.length : null,
    overdue,
    lead,
    delayed,
    cancelled,
    cancelRate: sel.orders.length ? cancelled.length / sel.orders.length : 0,
    cancelledValue: sum(cancelled, valueOf),
  }
}

export function team(sel) {
  const total = sum(sel.counted, valueOf)
  const rows = [...group(sel.orders, (o) => o.staffId || 'unknown', (k, o) => ({ key: k, label: o.staff, list: [] })).values()]
  return rows.map((g) => {
    const counted = g.list.filter((o) => o.counted)
    const revenue = sum(counted, valueOf)
    return {
      key: g.key, label: g.label, orders: counted.length, revenue, share: total ? revenue / total : 0,
      avg: counted.length ? revenue / counted.length : 0,
      items: sum(counted, (o) => sum(o.matchedItems || o.items, (i) => i.qty)),
      quickShare: counted.length ? counted.filter((o) => o.type === 'quick_sale').length / counted.length : 0,
      discounts: sum(counted, (o) => o.discount),
      discountRate: sum(counted, (o) => o.value + o.discount) ? sum(counted, (o) => o.discount) / sum(counted, (o) => o.value + o.discount) : 0,
      cancelled: g.list.length - counted.length,
    }
  }).filter((r) => r.orders || r.cancelled).sort((a, b) => b.revenue - a.revenue)
}

// ── Stock & waste ─────────────────────────────────────────────
export function stock(ds, period, { coverDays = 14, now = new Date() } = {}) {
  const rates = dailyRates(ds, 30, now)
  const bought = new Map()
  for (const p of ds.purchases) if (inPeriod(p.day, period) && !p.suspicious) bought.set(p.productId, (bought.get(p.productId) || 0) + p.qty)
  const sold = new Map()
  for (const o of ds.orders) if (o.counted && inPeriod(o.day, period)) for (const i of o.items) sold.set(i.productId, (sold.get(i.productId) || 0) + i.qty)
  const wasted = new Map()
  for (const w of ds.waste) if (inPeriod(w.day, period)) wasted.set(w.productId, (wasted.get(w.productId) || 0) + w.qty)

  const rows = [...ds.products.values()].filter((p) => p.active && typeof p.id === 'number').map((p) => {
    const rate = rates.get(p.id) || 0
    const level = p.stock ?? 0
    const daysCover = p.stockTracked && rate > 0 ? Math.max(level, 0) / rate : null
    let status = 'ok'
    if (!p.stockTracked) status = 'untracked'
    else if (level < 0) status = 'negative'
    else if (level === 0) status = rate > 0 ? 'out' : 'empty'
    else if ((daysCover != null && daysCover < 3) || (rate > 0 && p.lowStock && level <= p.lowStock)) status = 'low'
    else if (p.lowStock && level <= p.lowStock) status = 'idle'
    return {
      key: String(p.id), id: p.id, product: p, name: p.name, category: p.category, stock: p.stock, tracked: p.stockTracked,
      lowStock: p.lowStock, perDay: rate, daysCover, status,
      reorder: p.stockTracked && rate > 0 ? Math.max(Math.ceil(rate * coverDays - Math.max(level, 0)), 0) : 0,
      bought: bought.get(p.id) || 0, sold: sold.get(p.id) || 0, wasted: wasted.get(p.id) || 0,
      unitCost: p.cost, value: p.stockTracked && p.cost != null ? Math.max(level, 0) * p.cost : null,
    }
  })
  const order = { negative: 0, out: 1, low: 2, ok: 3, idle: 4, empty: 5, untracked: 6 }
  rows.sort((a, b) => order[a.status] - order[b.status] || (a.daysCover ?? 1e9) - (b.daysCover ?? 1e9))
  const waste = ds.waste.filter((w) => inPeriod(w.day, period))
  return {
    rows,
    waste,
    wasteQty: sum(waste, (w) => w.qty),
    wasteCost: sum(waste, (w) => w.cost),
    lastWasteDay: ds.waste.map((w) => w.day).sort().at(-1) || null,
    stockValue: sum(rows, (r) => r.value),
    counts: Object.fromEntries(Object.keys(order).map((k) => [k, rows.filter((r) => r.status === k).length])),
  }
}
