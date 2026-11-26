// The shop's rules, in one place. Each one mirrors a function in
// supabase/shop-rulebook.sql exactly; scripts/rulebook.test.mjs runs both on
// the same data and fails if they ever disagree.

/** shop_is_counted_sale: a sale counts unless deleted, voided, cancelled or refunded. */
export function isCountedSale(order) {
  return !order.deleted_at
    && !order.voided_at
    && (order.status || '') !== 'cancelled'
    && (order.payment_status || '') !== 'refunded'
}

/**
 * shop_till_kind: what a till line is.
 * 'sale_payment' | 'cash_in' | 'banked' | 'refund' | 'reversal' | 'correction' | 'expense'
 */
export function tillKind(row) {
  const cat = String(row.category || '').toLowerCase()
  const text = `${cat} ${String(row.description || '').toLowerCase()}`
  if (row.transaction_type === 'cash_in') return row.order_id || /(order|sale|payment)/.test(text) ? 'sale_payment' : 'cash_in'
  if (/banked/.test(text)) return 'banked'
  if (cat === 'refund' || /^refund/.test(String(row.description || '').toLowerCase())) return 'refund'
  if (/reversal/.test(cat)) return 'reversal'
  if (/adjust/.test(cat)) return 'correction'
  return 'expense'
}

export const TILL_KIND_LABEL = {
  sale_payment: 'Sale payment', cash_in: 'Cash in', banked: 'Banked overnight', refund: 'Refund',
  reversal: 'Order reversal', correction: 'Correction', expense: 'Cash out',
}

/** A till cash-out is a running cost only when it is a real expense (not banking, refunds or corrections). */
export const isTillCost = (row) => row.transaction_type === 'cash_out' && tillKind(row) === 'expense'

/** Removed by hand (not for an order) counts as waste. */
export const isWasteRemoval = (adj) => adj.adjustment_type === 'removal' && !/^order\s*#/i.test(adj.reason || '')
