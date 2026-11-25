// What a florist needs to know about an order at a glance.
import { dayKey, today } from './time.js'
import { tidyName } from './labels.js'

export const isCancelled = (o) => Boolean(o.voided_at) || o.status === 'cancelled' || o.payment_status === 'refunded'
export const isOpen = (o) => !isCancelled(o) && (o.status === 'new' || o.status === 'processing')
export const isDelivery = (o) => o.delivery_method && o.delivery_method !== 'pickup'
export const isQuick = (o) => o.order_type === 'quick_sale'
export const owes = (o) => !isCancelled(o) && Number(o.amount_due) > 0

/** The day the order is for: its delivery/pickup date, else the day it was taken. */
export const dueDay = (o) => o.delivery_date || dayKey(o.created_at)

/** 'late' | 'today' | 'tomorrow' | 'later' | null (closed orders). */
export function urgency(o, now = new Date()) {
  if (!isOpen(o)) return null
  const t = today(now)
  const d = dueDay(o)
  if (d < t) return 'late'
  if (d === t) return 'today'
  const tomorrow = new Date(`${t}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  if (d === tomorrow.toISOString().slice(0, 10)) return 'tomorrow'
  return 'later'
}

/**
 * Where the order is in its journey, and the one next step a person can take.
 * Pickup: New → Preparing → Done (collected).
 * Delivery: New → Preparing → With courier → Delivered.
 */
export function stage(o) {
  if (isCancelled(o)) return { key: 'cancelled', label: 'Cancelled', step: -1 }
  if (isDelivery(o)) {
    if (o.delivered_at || (o.status === 'done' && !isQuick(o))) return { key: 'delivered', label: o.delivered_at ? 'Delivered' : 'Done', step: 3 }
    if (o.delivery_handed_off_at) return { key: 'courier', label: 'With courier', step: 2 }
    if (o.status === 'processing') return { key: 'preparing', label: 'Preparing', step: 1 }
    return { key: 'new', label: 'New', step: 0 }
  }
  if (o.status === 'done') return { key: 'done', label: isQuick(o) ? 'Sold' : 'Collected', step: 2 }
  if (o.status === 'processing') return { key: 'preparing', label: 'Preparing', step: 1 }
  return { key: 'new', label: 'New', step: 0 }
}

export function itemSummary(o, max = 3) {
  const list = (o.items || []).map((i) => `${i.quantity}× ${tidyName(i.product_name)}`)
  if (list.length <= max) return list.join(', ')
  return `${list.slice(0, max).join(', ')} +${list.length - max} more`
}

export function matches(o, query) {
  if (!query) return true
  const q = query.toLowerCase().trim()
  const hay = `${o.order_number} ${o.client_name} ${o.client_phone} ${o.delivery_city} ${(o.items || []).map((i) => i.product_name).join(' ')}`.toLowerCase()
  return hay.includes(q) || q.replace(/\D/g, '').length >= 4 && String(o.client_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
}

/** Open orders first by when they are due (time included), then the rest newest first. */
export function byDue(a, b) {
  const da = `${dueDay(a)} ${a.delivery_time || '99'}`
  const db = `${dueDay(b)} ${b.delivery_time || '99'}`
  return da.localeCompare(db) || String(a.order_number).localeCompare(String(b.order_number))
}
export const byNewest = (a, b) => b.created_at.localeCompare(a.created_at)
