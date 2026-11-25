export const PAYMENT_LABELS = { cash: 'Cash', baridimob: 'BaridiMob', usd: 'Cash (USD)', card: 'Card', transfer: 'Transfer' }
export const CHANNEL_LABELS = { inhouse: 'In shop', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', phone: 'Phone', website: 'Website' }
export const TYPE_LABELS = { quick_sale: 'Quick sale', order: 'Order' }
export const STATUS_LABELS = { new: 'New', processing: 'In progress', done: 'Done', cancelled: 'Cancelled' }
export const PAY_STATUS_LABELS = { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', refunded: 'Refunded' }
export const DELIVERY_LABELS = { pickup: 'Pickup', motorcycle: 'Motorbike delivery', dhd: 'Shipping (DHD)', delivery: 'Delivery', shipping: 'Shipping', in_store: 'In shop' }

export function label(map, key, fallback = 'Not set') {
  if (key == null || key === '') return fallback
  return map[key] || String(key).charAt(0).toUpperCase() + String(key).slice(1).replace(/_/g, ' ')
}

/** Names typed in capitals in the POS ("RED FLOWERS") read better as "Red flowers". */
export function tidyName(name) {
  const s = String(name || '').trim()
  if (!s) return ''
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) return s.charAt(0) + s.slice(1).toLowerCase()
  return s
}
