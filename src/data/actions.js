// Everything Bloom writes. Shop records (stock, deliveries, supplier
// payments, waste) go through the same checked database functions the
// Blossom till uses, so stock, debts and the audit log stay identical.
// Bloom's own back-office tables (bloom_*) are written directly; their row
// level security limits them to owners and managers.
import { supabase } from '../lib/supabase.js'

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Turns database errors into sentences the shop understands. */
export function readable(error, fallback = 'Something went wrong.') {
  const msg = String(error?.message || error || '')
  if (/Failed to fetch|NetworkError|network|timeout/i.test(msg)) return 'Cannot reach the server. Check the internet connection and try again.'
  if (/Only an owner|role cannot|Only an owner or manager/i.test(msg)) return msg.replace(/role cannot manage inventory/i, 'Your account cannot change stock.')
  if (/permission denied|row-level security/i.test(msg)) return 'Your account is not allowed to do that.'
  if (/relation .*bloom_.* does not exist|Could not find the table 'public\.bloom_/i.test(msg)) return 'This part of Bloom is not set up yet. Run the setup SQL (Settings → Back office setup).'
  if (/could not find the function public\.bloom_/i.test(msg)) return 'This part of Bloom is not set up yet. Run the setup SQL (Settings → Back office setup).'
  if (/duplicate key/i.test(msg)) return 'That already exists.'
  if (/violates foreign key/i.test(msg)) return 'A linked product, supplier or person no longer exists. Refresh and try again.'
  if (/check constraint/i.test(msg)) return 'One of the values is not valid.'
  if (/stock changed|expected stock|does not match/i.test(msg)) return 'The stock changed while you were counting (a sale was made). Refresh and count again.'
  return msg || fallback
}

const pending = new Map()
/**
 * RPC with duplicate protection: the same action retried after a dropped
 * connection carries the same request id, so the server does it only once.
 * Falls back to the plain call on databases without the p_request_id version.
 */
async function rpcOnce(fn, params) {
  const key = `${fn}|${JSON.stringify(params)}`
  let id = pending.get(key)
  if (!id) { id = newId(); pending.set(key, id) }
  let res = await supabase.rpc(fn, { ...params, p_request_id: id })
  if (res.error && (res.error.code === 'PGRST202' || /could not find the function/i.test(res.error.message || ''))) {
    res = await supabase.rpc(fn, params)
  }
  if (!res.error || !/fetch|network|timeout|offline/i.test(res.error.message || '')) pending.delete(key)
  return res
}

async function call(fn, params, { once = false } = {}) {
  const { data, error } = once ? await rpcOnce(fn, params) : await supabase.rpc(fn, params)
  if (error) throw new Error(readable(error))
  return data
}

async function run(query) {
  const { data, error } = await query
  if (error) throw new Error(readable(error))
  return data
}

const int = (v) => Math.round(Number(v) || 0)
const text = (v, max = 300) => String(v ?? '').trim().slice(0, max)

// ─── Suppliers ──────────────────────────────────────────────────────────
export function saveSupplier(s) {
  const row = {
    company_name: text(s.company_name, 120),
    contact_person: text(s.contact_person, 120) || null,
    phone: text(s.phone, 30) || null,
    email: text(s.email, 120) || null,
    address: text(s.address, 300) || null,
    notes: text(s.notes, 500) || null,
  }
  if (!row.company_name) throw new Error('Enter the supplier’s name.')
  return s.supplier_id
    ? run(supabase.from('suppliers').update(row).eq('supplier_id', s.supplier_id))
    : run(supabase.from('suppliers').insert({ ...row, supplier_status: 'active' }))
}

/** Soft delete, like the till: history stays. */
export const deactivateSupplier = (id) => run(supabase.from('suppliers').update({ supplier_status: 'inactive' }).eq('supplier_id', id))
export const reactivateSupplier = (id) => run(supabase.from('suppliers').update({ supplier_status: 'active' }).eq('supplier_id', id))

/** A delivery: adds stock, adds what you owe, writes the audit log (owner only). */
export async function receiveDelivery(supplierId, lines, { paidNow = 0, method = 'cash', note = '' } = {}) {
  const items = lines.filter((l) => l.productId && int(l.quantity) > 0).map((l) => ({
    product_id: Number(l.productId), quantity: int(l.quantity), unit_cost: int(l.unitCost), notes: text(note, 200),
  }))
  if (!items.length) throw new Error('Add at least one product with a quantity.')
  if (items.some((i) => i.unit_cost < 0)) throw new Error('A cost cannot be negative.')
  const total = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  if (int(paidNow) < 0 || int(paidNow) > total) throw new Error('Paid now must be between 0 and the delivery total.')
  const result = await call('receive_supplier_stock', { p_supplier_id: Number(supplierId), p_items: items }, { once: true })
  if (int(paidNow) > 0) {
    try {
      await paySupplier(supplierId, paidNow, { method, note: note || 'Paid on delivery' })
    } catch (err) {
      throw Object.assign(new Error(`The delivery was saved, but the payment was not (${err.message}). Record it with “Pay supplier”; do not enter the delivery again.`), { saved: true })
    }
  }
  return result
}

export function paySupplier(supplierId, amount, { method = 'cash', note = '', transactionId = null } = {}) {
  if (!(int(amount) > 0)) throw new Error('Enter an amount greater than zero.')
  return call('pay_supplier', {
    p_supplier_id: supplierId == null ? null : Number(supplierId),
    p_amount: int(amount), p_notes: text(note), p_method: method || 'cash', p_transaction_id: transactionId,
  }, { once: true })
}

export function voidPurchase(transactionId, reason) {
  if (!text(reason)) throw new Error('Say why this delivery is being cancelled.')
  return call('void_supplier_entry', { p_transaction_id: transactionId, p_reason: text(reason) })
}

export function editPurchase(transactionId, { quantity, unitCost, note, date }) {
  if (quantity != null && !(int(quantity) > 0)) throw new Error('Quantity must be above zero. To remove the delivery, cancel it.')
  return call('update_supplier_entry', {
    p_transaction_id: transactionId,
    p_quantity: quantity == null ? null : int(quantity),
    p_unit_cost: unitCost == null ? null : int(unitCost),
    p_notes: note ?? null,
    p_transaction_date: date || null,
  })
}

// ─── Inventory ──────────────────────────────────────────────────────────
/** Stock count: only applied if nobody sold the product since you looked. */
export function setStock(productId, expected, counted, reason = 'Stock count') {
  if (!Number.isInteger(Number(counted)) || Number(counted) < 0) throw new Error('Enter the number you counted (0 or more).')
  return call('set_product_stock', { p_product_id: productId, p_expected_stock: int(expected), p_new_stock: int(counted), p_reason: text(reason, 100) || 'Stock count' })
}

export function recordWaste(productId, quantity, reason) {
  if (!(int(quantity) > 0)) throw new Error('Quantity must be above zero.')
  return call('record_flower_waste', { p_product_id: productId, p_quantity: int(quantity), p_reason: text(reason, 100) || 'Other' }, { once: true })
}

export function removeStock(productId, quantity, reason) {
  if (!(int(quantity) > 0)) throw new Error('Quantity must be above zero.')
  return call('remove_product_stock', { p_product_id: productId, p_quantity: int(quantity), p_reason: text(reason, 100) || 'Removed' }, { once: true })
}

export function saveProduct(id, changes) {
  const row = {}
  if (changes.retail_price != null) {
    if (!(Number(changes.retail_price) >= 0)) throw new Error('The price cannot be negative.')
    row.retail_price = int(changes.retail_price)
  }
  if (changes.low_stock_threshold != null) row.low_stock_threshold = Math.max(0, int(changes.low_stock_threshold))
  if (changes.supplier_id !== undefined) row.supplier_id = changes.supplier_id ? Number(changes.supplier_id) : null
  if (changes.is_active != null) row.is_active = !!changes.is_active
  return run(supabase.from('products').update(row).eq('product_id', id))
}

// ─── Purchase orders ────────────────────────────────────────────────────
export async function savePurchaseOrder(po) {
  const lines = (po.lines || []).filter((l) => l.productId && int(l.quantity) > 0)
  if (!po.supplierId) throw new Error('Choose a supplier.')
  if (!lines.length) throw new Error('Add at least one product with a quantity.')
  const head = { supplier_id: Number(po.supplierId), expected_on: po.expectedOn || null, notes: text(po.notes, 500) }
  let id = po.id
  if (id) await run(supabase.from('bloom_purchase_orders').update(head).eq('id', id).in('status', ['draft', 'sent']))
  else id = (await run(supabase.from('bloom_purchase_orders').insert(head).select('id').single())).id
  await run(supabase.from('bloom_purchase_order_lines').delete().eq('po_id', id))
  await run(supabase.from('bloom_purchase_order_lines').insert(lines.map((l) => ({ po_id: id, product_id: Number(l.productId), quantity: int(l.quantity), unit_cost: int(l.unitCost) }))))
  return id
}

export const markPurchaseOrderSent = (id) => run(supabase.from('bloom_purchase_orders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id).eq('status', 'draft'))
export const cancelPurchaseOrder = (id) => run(supabase.from('bloom_purchase_orders').update({ status: 'cancelled' }).eq('id', id).in('status', ['draft', 'sent']))

export function receivePurchaseOrder(id, lines) {
  return call('bloom_receive_purchase_order', {
    p_po_id: id,
    p_lines: lines ? lines.map((l) => ({ product_id: Number(l.productId), quantity: int(l.quantity), unit_cost: int(l.unitCost) })) : null,
  })
}

// ─── Expenses outside the till ──────────────────────────────────────────
export function saveExpense(e) {
  const row = {
    spent_on: e.day, category: text(e.category, 60), description: text(e.description),
    amount: int(e.amount), payment_method: e.method || 'cash', supplier_id: e.supplierId ? Number(e.supplierId) : null,
  }
  if (!row.category) throw new Error('Choose a category.')
  if (!(row.amount > 0)) throw new Error('Enter an amount greater than zero.')
  if (!row.spent_on) throw new Error('Choose the date.')
  return e.id ? run(supabase.from('bloom_expenses').update(row).eq('id', e.id)) : run(supabase.from('bloom_expenses').insert(row))
}

export const voidExpense = (id, reason) => run(supabase.from('bloom_expenses').update({ voided_at: new Date().toISOString(), void_reason: text(reason) || 'Cancelled' }).eq('id', id))

// ─── Staff & payroll ────────────────────────────────────────────────────
export function saveStaff(s) {
  const row = {
    full_name: text(s.full_name, 100), job_title: text(s.job_title, 60), phone: text(s.phone, 30),
    profile_id: s.profile_id || null, monthly_salary: Math.max(0, int(s.monthly_salary)),
    started_on: s.started_on || null, ended_on: s.ended_on || null, is_active: s.is_active !== false, notes: text(s.notes, 500),
  }
  if (!row.full_name) throw new Error('Enter the person’s name.')
  return s.id ? run(supabase.from('bloom_staff').update(row).eq('id', s.id)) : run(supabase.from('bloom_staff').insert(row))
}

export function saveStaffPayment(p) {
  const row = {
    staff_id: p.staffId, kind: p.kind, for_month: p.month, amount: int(p.amount), paid_on: p.day,
    payment_method: p.method || 'cash', from_register: !!p.fromRegister, notes: text(p.notes),
  }
  if (!(row.amount > 0)) throw new Error('Enter an amount greater than zero.')
  return run(supabase.from('bloom_staff_payments').insert(row))
}

export const voidStaffPayment = (id, reason) => run(supabase.from('bloom_staff_payments').update({ voided_at: new Date().toISOString(), void_reason: text(reason) || 'Cancelled' }).eq('id', id))

/** status null clears the day. */
export function setAttendance(staffId, day, status, note = '') {
  if (!status) return run(supabase.from('bloom_attendance').delete().eq('staff_id', staffId).eq('day', day))
  return run(supabase.from('bloom_attendance').upsert({ staff_id: staffId, day, status, note: text(note, 200), updated_at: new Date().toISOString() }))
}
