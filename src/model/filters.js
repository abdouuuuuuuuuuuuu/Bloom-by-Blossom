// Cross-filters. Clicking a bar, a product or a customer anywhere in Bloom
// adds one of these, and every page recomputes from the filtered selection.

import { inPeriod } from './period.js'
import { CHANNEL_LABELS, PAYMENT_LABELS, TYPE_LABELS, DELIVERY_LABELS, label } from '../lib/labels.js'
import { WEEKDAYS_LONG } from '../lib/time.js'

/** Filters on the order itself. */
export const ORDER_FILTERS = {
  channel: { name: 'Channel', test: (o, v) => o.channel === v, text: (v) => label(CHANNEL_LABELS, v) },
  payment: { name: 'Payment', test: (o, v) => o.payment === v, text: (v) => label(PAYMENT_LABELS, v) },
  type: { name: 'Sale type', test: (o, v) => o.type === v, text: (v) => label(TYPE_LABELS, v) },
  delivery: { name: 'Delivery', test: (o, v) => o.delivery === v, text: (v) => label(DELIVERY_LABELS, v) },
  staff: { name: 'Team', test: (o, v) => o.staffId === v, text: (v, ds) => ds.staffName.get(v) || 'Unknown' },
  weekday: { name: 'Weekday', test: (o, v) => o.weekday === Number(v), text: (v) => WEEKDAYS_LONG[v] },
  hour: { name: 'Hour', test: (o, v) => o.hour === Number(v), text: (v) => `${v}:00–${Number(v) + 1}:00` },
  customer: { name: 'Customer', test: (o, v) => o.customer === v, text: (v, ds) => (v === 'walk-in' ? 'Walk-ins' : ds.customers.get(v)?.name || 'Customer') },
  wilaya: { name: 'Wilaya', test: (o, v) => o.wilaya === v, text: (v) => v },
}

/** Filters on the items in the order. Orders are kept if any item matches. */
export const ITEM_FILTERS = {
  product: { name: 'Product', test: (i, v) => String(i.productId) === String(v), text: (v, ds) => ds.products.get(Number(v))?.name || ds.products.get(v)?.name || 'Product' },
  category: { name: 'Category', test: (i, v) => i.category === v, text: (v) => v },
  flower: { name: 'Flower', test: (i, v) => i.flower === v, text: (v) => v },
}

export function filterChips(filters, ds) {
  return Object.entries(filters).filter(([, v]) => v != null && v !== '').map(([key, v]) => {
    const def = ORDER_FILTERS[key] || ITEM_FILTERS[key]
    return { key, name: def?.name || key, text: def ? def.text(v, ds) : String(v) }
  })
}

/**
 * Orders (all statuses) and items in the period that pass the filters.
 * When an item filter is on, `items` holds only matching items and each
 * order's `scopedValue` is the value of its matching items, so totals mean
 * "sales of that product", not "whole baskets that contained it".
 */
export function select(ds, period, filters = {}) {
  const orderTests = Object.entries(filters).filter(([k, v]) => ORDER_FILTERS[k] && v != null && v !== '')
  const itemTests = Object.entries(filters).filter(([k, v]) => ITEM_FILTERS[k] && v != null && v !== '')
  const itemScoped = itemTests.length > 0
  const itemOk = (i) => itemTests.every(([k, v]) => ITEM_FILTERS[k].test(i, v))

  const orders = []
  const items = []
  for (const o of ds.orders) {
    if (!inPeriod(o.day, period)) continue
    if (!orderTests.every(([k, v]) => ORDER_FILTERS[k].test(o, v))) continue
    if (itemScoped) {
      const matched = o.items.filter(itemOk)
      if (!matched.length) continue
      orders.push({ ...o, scopedValue: matched.reduce((s, i) => s + i.value, 0), matchedItems: matched })
      if (o.counted) items.push(...matched)
    } else {
      orders.push(o)
      if (o.counted) items.push(...o.items)
    }
  }
  return { orders, counted: orders.filter((o) => o.counted), items, itemScoped, period }
}

/** The sales value an order contributes to the current selection. */
export const valueOf = (o) => (o.scopedValue ?? o.value)
