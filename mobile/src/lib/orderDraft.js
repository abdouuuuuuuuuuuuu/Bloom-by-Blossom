// A new order while it is being filled in on the phone, and how it becomes
// the exact payload Blossom POS sends to blossom_create_order.
// Pure functions: unit-tested in scripts/draft.test.mjs.

import { today } from './time.js'

export const emptyDraft = () => ({
  kind: 'order',              // 'order' (for later) | 'quick' (sold now at the counter)
  lines: [],                  // [{ id, name, price, quantity, category, color, flower_type, image_url }]
  customer: null,             // matched profile { customer_id, full_name, phone, order_count? }
  name: '',
  phone: '',
  source: 'instagram',
  fulfilment: 'pickup',       // 'pickup' | 'motorcycle' | 'dhd'
  date: '',
  time: '',
  town: '',
  wilaya: '',
  notes: '',
  adjustment: 0,              // negative = discount, positive = extra charge (whole DA)
  pay: 'full',                // 'full' | 'part' | 'later'
  paidAmount: '',
  method: 'cash',
})

export const digitsOf = (s) => String(s || '').replace(/\D/g, '')
export const hasUsablePhone = (s) => digitsOf(s).length >= 9

export function addLine(lines, product, qty = 1) {
  const found = lines.find((l) => l.id === product.id)
  if (found) return lines.map((l) => (l.id === product.id ? { ...l, quantity: l.quantity + qty } : l))
  return [...lines, {
    id: product.id, name: product.name, price: Math.round(Number(product.price) || 0), quantity: qty,
    category: product.category || '', color: product.color || '', flower_type: product.flower_type || '', image_url: product.image_url || '',
  }]
}

export function setQuantity(lines, id, quantity) {
  const q = Math.max(0, Math.floor(Number(quantity) || 0))
  return q === 0 ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, quantity: q } : l))
}

/** Same arithmetic as create_order(): total = max(0, subtotal + adjustment). */
export function totals(draft) {
  const subtotal = draft.lines.reduce((s, l) => s + l.quantity * l.price, 0)
  const adjustment = Math.max(Math.round(Number(draft.adjustment) || 0), -subtotal)
  const total = Math.max(0, subtotal + adjustment)
  const items = draft.lines.reduce((s, l) => s + l.quantity, 0)
  let paid = total
  if (draft.pay === 'later') paid = 0
  else if (draft.pay === 'part') paid = Math.min(Math.max(Math.round(Number(draft.paidAmount) || 0), 0), total)
  const due = total - paid
  return { subtotal, adjustment, total, items, paid, due, payStatus: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' }
}

/** Field errors, keyed by field. Empty object = ready to save. Mirrors Blossom checkout + server checks. */
export function validate(draft, { now = new Date() } = {}) {
  const errors = {}
  const t = totals(draft)
  const quick = draft.kind === 'quick'
  if (!draft.lines.length) errors.lines = 'Add at least one product.'
  if (!quick && !draft.customer) {
    if (!draft.name.trim()) errors.name = 'Enter the customer name.'
    if (!hasUsablePhone(draft.phone)) errors.phone = 'Enter a phone number (at least 9 digits).'
  }
  if (quick && t.due > 0 && !draft.customer && !hasUsablePhone(draft.phone)) {
    errors.phone = 'Add the customer phone to sell on credit.'
  }
  if (!quick && draft.fulfilment !== 'pickup') {
    if (!draft.date) errors.date = 'Choose the delivery date.'
    else if (draft.date < today(now)) errors.date = 'Choose today or a later date.'
    if (!draft.town.trim()) errors.town = 'Enter the delivery town.'
  }
  if (!quick && draft.fulfilment === 'pickup' && draft.date && draft.date < today(now)) {
    errors.date = 'Choose today or a later date.'
  }
  if (draft.pay === 'part') {
    const amount = Math.round(Number(draft.paidAmount) || 0)
    if (amount <= 0) errors.paidAmount = 'Enter the amount received.'
    else if (amount >= t.total) errors.paidAmount = 'That covers the whole order: choose "Paid".'
  }
  if (!Number.isInteger(Number(draft.adjustment))) errors.adjustment = 'Use a whole number of dinars.'
  return errors
}

/** Exactly what Blossom POS sends (src/lib/orders.js → createOrder), for the same server function. */
export function buildPayload(draft) {
  const t = totals(draft)
  const quick = draft.kind === 'quick'
  const delivery = !quick && draft.fulfilment !== 'pickup'
  const phone = (draft.customer?.phone || draft.phone || '').trim()
  const order = {
    client_name: draft.customer?.full_name || draft.name.trim() || 'Walk-in Customer',
    client_phone: phone,
    customer_id: draft.customer?.customer_id ?? null,
    delivery_date: quick ? '' : draft.date || '',
    delivery_time: quick ? '' : draft.time || '',
    delivery_method: quick ? 'pickup' : draft.fulfilment,
    delivery_city: delivery ? draft.town.trim() : '',
    delivery_wilaya: delivery ? draft.wilaya : '',
    delivery_latitude: '',
    delivery_longitude: '',
    shipping_distance_km: '',
    delivery_fee_amount: 0,
    delivery_fee_collected: false,
    delivery_fee_payment_method: '',
    payment_method: draft.method,
    client_source: quick ? 'inhouse' : draft.source,
    status: quick ? 'done' : 'new',
    order_type: quick ? 'quick_sale' : 'standard',
    notes: draft.notes.trim(),
    subtotal_amount: t.subtotal,
    tax_amount: 0,
    total_amount: t.total,
    price_adjustment: t.adjustment,
    amount_paid: t.paid,
    amount_due: t.due,
    payment_status: t.payStatus,
    payment_notes: 'Saved from Blossom Mobile',
  }
  const items = draft.lines.map((l) => ({
    product_id: l.id,
    quantity: l.quantity,
    unit_price: l.price,
    total_price: l.quantity * l.price,
    product_name: l.name,
    product_image: l.image_url || '',
    color: l.color || '',
    flower_type: l.flower_type || '',
    category: l.category || '',
  }))
  return { order, items }
}

/** Algerian numbers for WhatsApp links: 0555… -> 213555…; +33… stays as is. */
export function whatsappNumber(phone) {
  const raw = String(phone || '').trim()
  const d = digitsOf(raw)
  if (!d) return ''
  if (raw.startsWith('+') || d.startsWith('00')) return d.replace(/^00/, '')
  if (d.startsWith('213')) return d
  if (d.startsWith('0') && d.length === 10) return `213${d.slice(1)}`
  return d
}

export const WILAYAS = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Béjaïa', 'Biskra', 'Béchar', 'Blida', 'Bouira',
  'Tamanrasset', 'Tébessa', 'Tlemcen', 'Tiaret', 'Tizi Ouzou', 'Alger', 'Djelfa', 'Jijel', 'Sétif', 'Saïda',
  'Skikda', 'Sidi Bel Abbès', 'Annaba', 'Guelma', 'Constantine', 'Médéa', 'Mostaganem', "M'Sila", 'Mascara', 'Ouargla',
  'Oran', 'El Bayadh', 'Illizi', 'Bordj Bou Arréridj', 'Boumerdès', 'El Tarf', 'Tindouf', 'Tissemsilt', 'El Oued', 'Khenchela',
  'Souk Ahras', 'Tipaza', 'Mila', 'Aïn Defla', 'Naâma', 'Aïn Témouchent', 'Ghardaïa', 'Relizane', 'Timimoun', 'Bordj Badji Mokhtar',
  'Ouled Djellal', 'Béni Abbès', 'In Salah', 'In Guezzam', 'Touggourt', 'Djanet', "El M'Ghair", 'El Meniaa',
]
