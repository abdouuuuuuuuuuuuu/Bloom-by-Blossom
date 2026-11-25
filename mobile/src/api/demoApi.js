// DEMO ONLY (npm run dev + ?demo). Made-up shop in memory, so every screen
// can be tried without touching the real database. Never part of a build:
// api/index.js only imports it when import.meta.env.DEV is true.
import { addDays, today } from '../lib/time.js'

const t = today()
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms))
let seq = 1650

const products = [
  ['Red roses', 400, 'Flowers', 'Rose', true], ['Pink roses', 400, 'Flowers', 'Rose', true], ['White roses', 400, 'Flowers', 'Rose', true],
  ['White lily', 950, 'Flowers', 'Lily', false], ['Pink lily', 950, 'Flowers', 'Lily', false], ['Chrysanthemum', 350, 'Flowers', 'Chrysanthemum', false],
  ['Gypsophila', 350, 'Flowers', 'Other flower', false], ['Tulip', 650, 'Flowers', 'Tulip', false], ['Sunflower', 550, 'Flowers', 'Other flower', false],
  ['Wrapping', 500, 'Decoration', '', true], ['Ribbon', 500, 'Decoration', '', false], ['Card note', 50, 'Decoration', '', false],
  ['Heart box', 1850, 'Gifts', '', false], ['Chocolate box', 1550, 'Gifts', '', false], ['Teddy bear', 2500, 'Gifts', '', false],
].map(([name, price, category, flower, starred], i) => ({ id: i + 1, name, price, stock: 50, category, image_url: '', color: '', flower_type: flower, starred }))

const customers = [
  { customer_id: 1, full_name: 'Amina Kaci', phone: '0555123456' },
  { customer_id: 2, full_name: 'Yacine B.', phone: '0661987654' },
]

const mk = (o) => ({
  id: crypto.randomUUID(), order_number: String(seq++), created_at: new Date().toISOString(), status: 'new', order_type: 'standard',
  payment_method: 'cash', payment_status: 'paid', client_source: 'instagram', client_name: 'Walk-in Customer', client_phone: '',
  customer_id: null, total_amount: 0, amount_paid: 0, amount_due: 0, price_adjustment: 0, delivery_method: 'pickup', delivery_date: null,
  delivery_time: null, delivery_city: '', delivery_wilaya: '', delivery_latitude: null, delivery_longitude: null,
  delivery_handed_off_at: null, delivered_at: null, voided_at: null, void_reason: null, notes: '', created_by: 'demo', items: [], ...o,
})
const line = (pid, quantity) => { const p = products[pid - 1]; return { id: crypto.randomUUID(), product_id: p.id, product_name: p.name, product_image: '', quantity, unit_price: p.price, total_price: p.price * quantity, category: p.category } }
const withTotals = (o) => { const total = o.items.reduce((s, i) => s + i.total_price, 0) + (o.price_adjustment || 0); return { ...o, total_amount: total, amount_due: total - o.amount_paid, payment_status: total - o.amount_paid === 0 ? 'paid' : o.amount_paid ? 'partial' : 'unpaid' } }

let orders = [
  withTotals(mk({ client_name: 'Amina Kaci', client_phone: '0555123456', customer_id: 1, delivery_method: 'motorcycle', delivery_date: t, delivery_time: '16:00:00', delivery_city: 'Batna centre', delivery_wilaya: 'Batna', items: [line(1, 25), line(10, 1)], amount_paid: 5000, notes: 'Card: Happy birthday Lina ♥' })),
  withTotals(mk({ client_name: 'Yacine B.', client_phone: '0661987654', customer_id: 2, status: 'processing', delivery_date: t, delivery_time: '18:30:00', items: [line(4, 5), line(7, 3)], amount_paid: 0 })),
  withTotals(mk({ client_name: 'Sara M.', client_phone: '0770112233', delivery_method: 'dhd', delivery_date: addDays(t, 1), delivery_city: 'Sétif', delivery_wilaya: 'Sétif', items: [line(2, 30), line(13, 1)], amount_paid: 14000 })),
  withTotals(mk({ client_name: 'Nour H.', client_phone: '0550443322', delivery_date: addDays(t, 3), items: [line(3, 12)], amount_paid: 4800, client_source: 'whatsapp' })),
  withTotals(mk({ client_name: 'Karim', client_phone: '0791001122', status: 'processing', delivery_method: 'motorcycle', delivery_date: addDays(t, -1), delivery_city: 'Batna', delivery_wilaya: 'Batna', items: [line(5, 7)], amount_paid: 0 })),
  withTotals(mk({ order_type: 'quick_sale', status: 'done', client_source: 'inhouse', items: [line(1, 5)], amount_paid: 2000 })),
  withTotals(mk({ order_type: 'quick_sale', status: 'done', client_source: 'inhouse', payment_method: 'baridimob', items: [line(6, 10), line(10, 1)], amount_paid: 4000 })),
]

const find = (id) => orders.find((o) => o.id === id)
const update = (id, patch) => { orders = orders.map((o) => (o.id === id ? withTotals({ ...o, ...patch }) : o)) }
const saved = new Map()

export const newRequestId = () => crypto.randomUUID()
export const isNetworkError = () => false
export async function signIn() { await wait(); demoSession.signedIn = true; demoSession.listeners.forEach((f) => f()) }
export async function signOut() { demoSession.signedIn = false; demoSession.listeners.forEach((f) => f()) }
const demoSession = { signedIn: true, listeners: new Set() }
export async function currentProfile() {
  const role = new URLSearchParams(location.search).get('role') || 'owner'
  return demoSession.signedIn ? { id: 'demo', full_name: 'Demo Florist', username: 'demo', role, is_active: true } : null
}
export function onAuthChange(cb) { demoSession.listeners.add(cb); return () => demoSession.listeners.delete(cb) }
export async function shopName() { return 'Blossom' }
export async function loadProducts() { await wait(); return products }
export async function loadOrders() { await wait(); return orders.map((o) => ({ ...o })) }
export async function loadOrder(id) { await wait(150); return find(id) ? { ...find(id) } : null }
export async function findCustomer(phone) { await wait(); const d = phone.replace(/\D/g, '').slice(-9); return customers.find((c) => c.phone.slice(-9) === d) || null }

export async function createOrder({ order, items }, requestId) {
  await wait(600)
  if (saved.has(requestId)) return { order: saved.get(requestId) }
  if (order.order_type !== 'quick_sale' && !order.customer_id && order.client_phone.replace(/\D/g, '').length < 9) throw new Error('Add a phone number or select a customer profile before creating this order')
  const o = withTotals(mk({
    ...order, customer_id: order.customer_id ?? 100 + seq, delivery_date: order.delivery_date || null, delivery_time: order.delivery_time || null,
    items: items.map((i) => ({ id: crypto.randomUUID(), ...i })), amount_paid: order.amount_paid,
  }))
  orders = [o, ...orders]
  saved.set(requestId, o)
  return { order: o, warnings: { negative_stock: [] } }
}
export async function findCreatedOrder(requestId) { return saved.get(requestId) || null }
export async function setStatus(id, status) { await wait(); update(id, { status }) }
export async function markHandedOff(id) { await wait(); update(id, { delivery_handed_off_at: new Date().toISOString(), status: find(id).status === 'new' ? 'processing' : find(id).status }) }
export async function markDelivered(id) { await wait(); update(id, { delivered_at: new Date().toISOString(), status: 'done' }) }
export async function reschedule(id, date) { await wait(); if (date < today()) throw new Error('Choose today or a later date.'); update(id, { delivery_date: date }) }
export async function cancelOrder(id, reason) { await wait(); update(id, { voided_at: new Date().toISOString(), void_reason: reason, status: 'cancelled' }) }
export async function recordPayment({ orderId, amount }) {
  await wait()
  const o = find(orderId)
  if (amount > o.amount_due) throw new Error('The payment is more than what is still owed.')
  update(orderId, { amount_paid: o.amount_paid + Math.round(amount) })
}
