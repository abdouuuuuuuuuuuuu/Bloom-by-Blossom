// Talks to the shop database. Every change goes through the same server
// functions as Blossom POS on the PC, so roles, stock, the cash register
// and customer profiles are handled exactly the same way.
import { supabase } from '../lib/supabase.js'
import { translateOrderError } from '../lib/orderErrors.js'
import { addDays, today } from '../lib/time.js'

const ORDER_COLUMNS = [
  'id', 'order_number', 'created_at', 'status', 'order_type', 'payment_method', 'payment_status', 'client_source',
  'client_name', 'client_phone', 'customer_id', 'total_amount', 'amount_paid', 'amount_due', 'price_adjustment',
  'delivery_method', 'delivery_date', 'delivery_time', 'delivery_city', 'delivery_wilaya', 'delivery_latitude',
  'delivery_longitude', 'delivery_handed_off_at', 'delivered_at', 'voided_at', 'void_reason', 'notes', 'created_by',
].join(',')
const ITEM_COLUMNS = 'id,order_id,product_id,product_name,product_image,quantity,unit_price,total_price,category'

const fail = (error) => { throw new Error(translateOrderError(error)) }

async function call(fn, params) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) fail(error)
  return data
}

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const isNetworkError = (err) => /fetch|network|timeout|offline|load failed/i.test(String(err?.message || err || ''))

// ── Session ──────────────────────────────────────────────────
export async function signIn(identifier, password) {
  let email = String(identifier || '').trim()
  if (!email.includes('@')) {
    const { data, error } = await supabase.rpc('email_for_username', { p_username: email })
    if (error) throw new Error('Could not reach the shop. Check the internet and try again.')
    if (!data) throw new Error('Wrong username or password.')
    email = data
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.status === 400 ? 'Wrong username or password.' : 'Could not sign in. Try again.')
}

export const signOut = () => supabase.auth.signOut()

export async function currentProfile() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data, error } = await supabase.from('profiles').select('id,full_name,username,role,is_active').eq('id', session.user.id).maybeSingle()
  if (error) throw error
  return data
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') callback()
  })
  return () => data.subscription.unsubscribe()
}

export async function shopName() {
  const { data } = await supabase.rpc('get_shop_name')
  return data || 'Blossom'
}

// ── Reading ──────────────────────────────────────────────────
export async function loadProducts() {
  const rows = []
  for (;;) {
    const { data, error } = await supabase.from('products')
      .select('product_id,item_name,retail_price,stock_level,category,image_url,color,flower_type,is_starred')
      .eq('is_active', true).order('item_name').order('product_id').range(rows.length, rows.length + 499)
    if (error) fail(error)
    if (!data.length) break
    rows.push(...data)
  }
  return rows.map((p) => ({
    id: p.product_id, name: p.item_name, price: Math.round(Number(p.retail_price) || 0), stock: p.stock_level,
    category: p.category || 'Other', image_url: p.image_url || '', color: p.color || '', flower_type: p.flower_type || '', starred: Boolean(p.is_starred),
  }))
}

/**
 * The orders that matter on a phone: everything still open, everything due
 * from a week ago on, and the last 14 days of sales. Archived orders are hidden.
 */
export async function loadOrders(now = new Date()) {
  const t = today(now)
  const since = `${addDays(t, -14)}T00:00:00+01:00`
  const base = () => supabase.from('orders').select(ORDER_COLUMNS).is('deleted_at', null)
  const queries = [
    base().gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    base().in('status', ['new', 'processing']).is('voided_at', null).limit(1000),
    base().gte('delivery_date', addDays(t, -7)).limit(1000),
    base().gt('amount_due', 0).is('voided_at', null).neq('payment_status', 'refunded').limit(1000),
  ]
  const results = await Promise.all(queries)
  const byId = new Map()
  for (const { data, error } of results) {
    if (error) fail(error)
    for (const o of data) byId.set(o.id, o)
  }
  const orders = [...byId.values()]
  const items = await loadItems(orders.map((o) => o.id))
  const byOrder = new Map()
  for (const it of items) (byOrder.get(it.order_id) || byOrder.set(it.order_id, []).get(it.order_id)).push(it)
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }))
}

async function loadItems(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('order_items').select(ITEM_COLUMNS).in('order_id', ids.slice(i, i + 150))
    if (error) fail(error)
    out.push(...data)
  }
  return out
}

export async function loadOrder(id) {
  const { data, error } = await supabase.from('orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle()
  if (error) fail(error)
  if (!data) return null
  const items = await loadItems([id])
  return { ...data, items }
}

/** Existing customer for a phone number, or null. Never creates one. */
export async function findCustomer(phone) {
  return call('blossom_resolve_customer', { p_phone: phone, p_create_if_missing: false })
}

// ── Changing ─────────────────────────────────────────────────
/** Same call as Blossom POS checkout. Safe to retry with the same request id. */
export async function createOrder({ order, items }, requestId) {
  return call('blossom_create_order', { p_order: order, p_items: items, p_request_id: requestId })
}

/** The order saved under this request id by me, or null. */
export async function findCreatedOrder(requestId) {
  const data = await call('get_order_creation_result', { p_request_id: requestId })
  return data?.order ?? null
}

export const setStatus = (orderId, status) => call('set_order_status', { p_order_id: orderId, p_status: status })
export const markHandedOff = (orderId) => call('mark_order_handed_off', { p_order_id: orderId })
export const markDelivered = (orderId) => call('mark_order_delivered', { p_order_id: orderId })
export const reschedule = (orderId, date, reason) => call('reschedule_order', { p_order_id: orderId, p_delivery_date: date, p_reason: reason || 'Rescheduled from Blossom Mobile' })
export const cancelOrder = (orderId, reason) => call('blossom_void_order', { p_order_id: orderId, p_reason: reason || '' })

export function recordPayment({ orderId, amount, method, requestId }) {
  return call('record_order_payment', {
    p_order_id: orderId, p_request_id: requestId, p_amount: Math.round(Number(amount)),
    p_payment_method: method, p_notes: 'Recorded from Blossom Mobile', p_action: 'payment',
  })
}
