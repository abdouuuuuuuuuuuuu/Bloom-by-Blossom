// Turns raw Supabase rows into one clean, cross-linked dataset.
// Everything downstream (periods, filters, metrics) reads from this.
// Pure: no network, no React.

import { dayKey, shopHour, weekdayOf } from '../lib/time.js'
import { tidyName } from '../lib/labels.js'
import { isCountedSale, isTillCost, isWasteRemoval } from './rules.js'

/** An order counts towards sales unless it was deleted, voided, cancelled or refunded (rules.js). */
export const isCounted = isCountedSale

const WALK_IN = /^walk[\s-]?in/i
const digits = (s) => String(s || '').replace(/\D/g, '')

/** Who bought it. Walk-ins without a phone are pooled into one key. */
export function customerKey(order) {
  const name = String(order.client_name || '').trim()
  const phone = digits(order.client_phone)
  if (order.customer_id) return `c${order.customer_id}`
  if (phone.length >= 6) return `p${phone.slice(-9)}`
  if (!name || WALK_IN.test(name)) return 'walk-in'
  return `n${name.toLowerCase().replace(/\s+/g, ' ')}`
}

/** Stock counts at or above this are placeholders ("unlimited"), not real counts. */
export const UNTRACKED_STOCK = 5000

const num = (v) => Number(v) || 0

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * @param raw {orders, items, products, purchases, cash, suppliers, customers, adjustments, waste, settings, profiles}
 * @param prefs user settings from the Settings page: { costOverrides: {productId: cost} }
 */
export function buildDataset(raw, prefs = {}) {
  const overrides = prefs.costOverrides || {}
  const staffName = new Map((raw.profiles || []).map((p) => [p.id, p.full_name || p.username || 'Team member']))
  const supplierName = new Map((raw.suppliers || []).map((s) => [s.supplier_id, s.company_name || s.contact_person || `Supplier ${s.supplier_id}`]))

  // ── Products ───────────────────────────────────────────────
  const products = new Map()
  for (const p of raw.products || []) {
    const stock = p.stock_level == null ? null : num(p.stock_level)
    products.set(p.product_id, {
      id: p.product_id,
      name: tidyName(p.item_name) || `Product ${p.product_id}`,
      category: p.category || 'Uncategorised',
      flower: p.flower_type || '',
      color: p.color || '',
      listPrice: num(p.retail_price),
      stock,
      stockTracked: stock != null && stock < UNTRACKED_STOCK,
      lowStock: num(p.low_stock_threshold),
      supplierId: p.supplier_id,
      active: p.is_active !== false,
      image: p.image_url || null,
      purchases: [],
      cost: null,
      costSource: 'none',
      wholesale: num(p.wholesale_cost),
    })
  }
  const productOf = (id, fallbackName) => {
    if (id != null && products.has(id)) return products.get(id)
    const key = id ?? `name:${String(fallbackName || '').toLowerCase()}`
    if (!products.has(key)) {
      products.set(key, {
        id: key, name: tidyName(fallbackName) || 'Unnamed item', category: 'Uncategorised', flower: '', color: '',
        listPrice: 0, stock: null, stockTracked: false, lowStock: 0, active: false, image: null,
        purchases: [], cost: null, costSource: 'none', removed: true,
      })
    }
    return products.get(key)
  }

  // ── Supplier purchases → cost per unit ─────────────────────
  const anomalies = []
  const purchases = (raw.purchases || [])
    .filter((t) => !t.transaction_type || t.transaction_type === 'purchase')
    .map((t) => {
      const product = productOf(t.product_id)
      const qty = num(t.quantity)
      const unitCost = num(t.unit_cost) || (qty ? num(t.total_cost) / qty : 0)
      const day = t.transaction_date || dayKey(t.received_at || t.created_at)
      return {
        id: t.transaction_id, day, month: day.slice(0, 7), product, productId: product.id,
        supplierId: t.supplier_id, supplier: supplierName.get(t.supplier_id) || 'Unknown supplier',
        qty, unitCost, total: num(t.total_cost) || qty * unitCost,
        paid: num(t.amount_paid), due: num(t.amount_due), status: t.payment_status || 'paid',
        suspicious: false,
      }
    })
  // A purchase whose unit cost is far above the selling price or far above
  // the product's usual cost is almost certainly a typing mistake.
  const byProduct = new Map()
  for (const t of purchases) (byProduct.get(t.productId) || byProduct.set(t.productId, []).get(t.productId)).push(t)
  for (const [, list] of byProduct) {
    const usual = median(list.map((t) => t.unitCost).filter((c) => c > 0))
    for (const t of list) {
      const price = t.product.listPrice
      const tooHigh = (price > 0 && t.unitCost > price * 5) || (list.length >= 3 && usual > 0 && t.unitCost > usual * 5)
      if (tooHigh) {
        t.suspicious = true
        anomalies.push({
          kind: 'purchase', id: t.id, productId: t.productId, product: t.product.name, day: t.day,
          text: `${t.product.name}: bought ${t.qty} at ${Math.round(t.unitCost)} DA each on ${t.day}, but it sells for ${price} DA.`,
        })
      }
    }
    const good = list.filter((t) => !t.suspicious && t.qty > 0 && t.unitCost > 0)
    const qty = good.reduce((s, t) => s + t.qty, 0)
    const product = list[0].product
    product.purchases = list
    if (qty) { product.cost = good.reduce((s, t) => s + t.qty * t.unitCost, 0) / qty; product.costSource = 'purchases' }
  }
  // No usable purchases: fall back to the wholesale cost set on the product, if any (shop_product_cost).
  for (const product of products.values()) {
    if (product.cost == null && product.wholesale > 0) { product.cost = product.wholesale; product.costSource = 'manual' }
  }
  for (const [id, value] of Object.entries(overrides)) {
    const product = products.get(Number(id)) || products.get(id)
    if (product && Number(value) >= 0 && value !== '' && value != null) {
      product.cost = Number(value); product.costSource = 'manual'
    }
  }

  // ── Orders and their items ─────────────────────────────────
  const orders = []
  const orderById = new Map()
  for (const o of raw.orders || []) {
    if (o.deleted_at) continue
    const day = dayKey(o.created_at)
    const value = num(o.total_amount)
    const paid = Math.min(num(o.amount_paid), value)
    const adjustment = num(o.price_adjustment)
    const order = {
      id: o.id,
      number: o.order_number,
      at: o.created_at,
      day,
      month: day.slice(0, 7),
      hour: shopHour(o.created_at),
      weekday: weekdayOf(day),
      counted: isCounted(o),
      status: o.voided_at ? 'cancelled' : o.status,
      payStatus: o.payment_status || 'paid',
      type: o.order_type === 'quick_sale' ? 'quick_sale' : 'order',
      channel: o.client_source || 'inhouse',
      payment: o.payment_method || 'cash',
      customer: customerKey(o),
      clientName: String(o.client_name || '').trim(),
      clientPhone: o.client_phone || '',
      customerId: o.customer_id,
      value,
      paid,
      due: o.amount_due != null ? Math.max(num(o.amount_due), 0) : Math.max(value - paid, 0),
      discount: adjustment < 0 ? -adjustment : 0,
      extra: adjustment > 0 ? adjustment : 0,
      delivery: o.delivery_method || 'pickup',
      deliveryDate: o.delivery_date || null,
      deliveryTime: o.delivery_time || null,
      originalDeliveryDate: o.original_delivery_date || null,
      delays: Array.isArray(o.delay_history) ? o.delay_history.length : 0,
      delayReason: o.delay_reason || '',
      deliveredDay: o.delivered_at ? dayKey(o.delivered_at) : null,
      wilaya: o.delivery_wilaya || '',
      city: o.delivery_city || '',
      staffId: o.created_by || o.cashier_id || null,
      staff: staffName.get(o.created_by || o.cashier_id) || 'Unknown',
      voidReason: o.void_reason || '',
      notes: o.notes || '',
      items: [],
    }
    orders.push(order)
    orderById.set(order.id, order)
  }
  orders.sort((a, b) => a.at.localeCompare(b.at))

  // One person can appear under a customer link on one order and only a phone
  // on another. Merge every key that shares a phone or a customer link.
  const parent = new Map()
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k) } return k }
  const union = (a, b) => { for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k); const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra) }
  for (const o of orders) {
    const phone = digits(o.clientPhone)
    if (o.customer === 'walk-in') continue
    const keys = [o.customerId ? `c${o.customerId}` : null, phone.length >= 6 ? `p${phone.slice(-9)}` : null, o.customer].filter(Boolean)
    for (const k of keys) union(keys[0], k)
  }
  for (const o of orders) if (o.customer !== 'walk-in' && parent.has(o.customer)) o.customer = find(o.customer)

  const items = []
  for (const it of raw.items || []) {
    const order = orderById.get(it.order_id)
    if (!order) continue
    const product = productOf(it.product_id, it.product_name)
    const qty = num(it.quantity)
    const value = num(it.total_price) || qty * num(it.unit_price)
    const item = {
      id: it.id,
      order,
      product,
      productId: product.id,
      name: tidyName(it.product_name) || product.name,
      category: it.category || product.category,
      flower: it.flower_type || product.flower || '',
      color: it.color || product.color || '',
      qty,
      value,
      unitPrice: qty ? value / qty : 0,
      cost: product.cost == null ? null : product.cost * qty,
      image: it.product_image || product.image,
    }
    order.items.push(item)
    items.push(item)
  }

  // ── Customers (lifetime) ───────────────────────────────────
  const customers = new Map()
  for (const o of orders) {
    if (!o.counted || o.customer === 'walk-in') continue
    let c = customers.get(o.customer)
    if (!c) {
      c = { key: o.customer, name: o.clientName || 'Unnamed customer', phone: o.clientPhone, orders: [], first: o.day, last: o.day }
      customers.set(o.customer, c)
    }
    c.orders.push(o)
    c.last = o.day
    if (!c.phone && o.clientPhone) c.phone = o.clientPhone
    if (o.clientName) c.name = o.clientName
  }

  // ── Running costs (cash register cash-outs) ────────────────
  const expenses = (raw.cash || [])
    .filter((c) => c.transaction_type === 'cash_out')
    .map((c) => {
      const category = (c.category || '').trim() || 'Other'
      const day = c.register_date || dayKey(c.created_at)
      return {
        id: c.id, day, month: day.slice(0, 7), amount: num(c.amount), category,
        description: (c.description || '').trim(), payment: c.payment_method || 'cash',
        // Not a cost: banking, refunds, corrections, order reversals (rules.js → shop_till_kind).
        isExpense: isTillCost(c),
      }
    })

  // ── Waste (wilted / damaged stock), valued at purchase cost ─
  const waste = [
    ...(raw.waste || []).map((w) => ({ id: `w${w.id}`, productId: w.product_id, qty: num(w.quantity), reason: w.reason || 'Waste', day: w.waste_date || '' })),
    ...(raw.adjustments || [])
      .filter(isWasteRemoval)
      .map((a) => ({ id: `a${a.id}`, productId: a.product_id, qty: Math.abs(num(a.quantity)), reason: a.reason || 'Removed', day: dayKey(a.created_at) })),
  ].map((w) => {
    const product = productOf(w.productId)
    return { ...w, month: w.day.slice(0, 7), product, cost: product.cost == null ? null : product.cost * w.qty }
  })

  const settings = (raw.settings && raw.settings[0]) || {}

  return {
    orders, items, products, purchases, expenses, waste, customers, anomalies,
    staffName, supplierName,
    dailyTarget: num(settings.daily_target),
    shopName: settings.shop_name || 'Blossom',
    firstDay: orders[0]?.day || null,
    lastDay: orders.at(-1)?.day || null,
  }
}
