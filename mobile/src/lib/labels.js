export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'baridimob', label: 'BaridiMob' },
  { id: 'usd', label: 'USDT' },
]

export const SOURCES = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'phone', label: 'Phone' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'inhouse', label: 'In shop' },
]

export const FULFILMENT = [
  { id: 'pickup', label: 'Pickup', hint: 'Customer collects' },
  { id: 'motorcycle', label: 'Motorbike', hint: 'Local delivery' },
  { id: 'dhd', label: 'DHD', hint: 'Shipping company' },
]

export const STATUS = {
  new: { label: 'New', tone: 'plum' },
  processing: { label: 'Preparing', tone: 'amber' },
  done: { label: 'Done', tone: 'sage' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
}

export const PAY_STATUS = {
  paid: { label: 'Paid', tone: 'sage' },
  partial: { label: 'Part paid', tone: 'amber' },
  unpaid: { label: 'Unpaid', tone: 'rose' },
  refunded: { label: 'Refunded', tone: 'muted' },
}

export const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', florist: 'Florist', cashier: 'Cashier', delivery: 'Delivery' }

const find = (list, id) => list.find((x) => x.id === id)?.label
export const paymentLabel = (id) => find(PAYMENT_METHODS, id) || id || 'Cash'
export const sourceLabel = (id) => find(SOURCES, id) || id || 'In shop'
export const fulfilmentLabel = (id) => find(FULFILMENT, id) || id || 'Pickup'

/** Names typed in capitals in the POS ("RED FLOWERS") read better as "Red flowers". */
export function tidyName(name) {
  const s = String(name || '').trim()
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) return s.charAt(0) + s.slice(1).toLowerCase()
  return s
}
