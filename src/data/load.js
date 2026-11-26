// Reads everything Bloom shows. Writes live in actions.js.
import { supabase } from '../lib/supabase.js'

const PAGE = 1000

const SOURCES = {
  orders: { table: 'orders', order: 'created_at', filter: (q) => q.is('deleted_at', null),
    columns: 'id,order_number,created_at,status,order_type,payment_method,payment_status,client_source,client_name,client_phone,customer_id,total_amount,amount_paid,amount_due,price_adjustment,delivery_method,delivery_date,delivery_time,delivery_wilaya,delivery_city,original_delivery_date,delay_reason,delay_history,delivered_at,created_by,cashier_id,voided_at,void_reason,notes,deleted_at' },
  items: { table: 'order_items', order: 'id', columns: 'id,order_id,product_id,product_name,product_image,quantity,unit_price,total_price,category,flower_type,color' },
  products: { table: 'products', order: 'product_id', columns: 'product_id,item_name,category,flower_type,color,retail_price,stock_level,low_stock_threshold,supplier_id,is_active,image_url' },
  purchases: { table: 'supplier_transactions', order: 'transaction_id', filter: (q) => q.is('voided_at', null), columns: 'transaction_id,supplier_id,product_id,quantity,unit_cost,total_cost,amount_paid,amount_due,payment_status,transaction_date,transaction_type,received_at,created_at,notes' },
  // Every till line: openings, sales paid in, cash-outs, closings with the counted pockets.
  cash: { table: 'cash_register', order: 'id', columns: '*' },
  suppliers: { table: 'suppliers', order: 'supplier_id', columns: 'supplier_id,company_name,contact_person,phone,email,address,notes,supplier_status' },
  supplierPayments: { table: 'supplier_payments', order: 'payment_id', columns: 'payment_id,supplier_id,amount,payment_method,notes,transaction_id,paid_at,created_at' },
  supplierBalances: { table: 'supplier_balances', order: 'supplier_id', columns: '*' },
  // Every stock movement (deliveries, counts, removals, sales…), with before/after and who.
  adjustments: { table: 'stock_adjustments', order: 'id', columns: '*' },
  waste: { table: 'flower_waste', order: 'id', columns: '*' },
  settings: { table: 'settings', order: 'id', columns: 'daily_target,shop_name' },
  profiles: { table: 'profiles', order: 'id', columns: 'id,full_name,username,role,is_active' },
  // Bloom's own back-office tables (supabase/bloom-back-office.sql).
  bExpenses: { table: 'bloom_expenses', order: 'id', filter: (q) => q.is('voided_at', null), columns: '*' },
  staff: { table: 'bloom_staff', order: 'id', columns: '*' },
  staffPayments: { table: 'bloom_staff_payments', order: 'id', filter: (q) => q.is('voided_at', null), columns: '*' },
  attendance: { table: 'bloom_attendance', order: 'day', columns: 'staff_id,day,status,note' },
  purchaseOrders: { table: 'bloom_purchase_orders', order: 'id', columns: '*' },
  poLines: { table: 'bloom_purchase_order_lines', order: 'id', columns: '*' },
}

const BACK_OFFICE = new Set(['bExpenses', 'staff', 'staffPayments', 'attendance', 'purchaseOrders', 'poLines'])
const isMissingTable = (err) => err?.code === '42P01' || err?.code === 'PGRST205' || /does not exist|Could not find the table/i.test(err?.message || '')

/** Tables Bloom can work without; a permission error there is shown, not fatal. */
const OPTIONAL = new Set(['purchases', 'cash', 'suppliers', 'supplierPayments', 'supplierBalances', 'adjustments', 'waste', 'settings', ...BACK_OFFICE])

async function all(source) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(source.table).select(source.columns)
    if (source.filter) q = source.filter(q)
    const { data, error } = await q.order(source.order).range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/**
 * Everything Bloom needs, in one go.
 * Returns { raw, restricted: [tables we may not read], setupNeeded: true when the back-office SQL is not applied }.
 */
export async function loadAll() {
  // Dev only: `npm run dev` + ?fixture loads a local JSON snapshot instead (never in the built app).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
    return { raw: await (await fetch('/__fixture.json')).json(), restricted: [], setupNeeded: false }
  }
  const restricted = []
  let setupNeeded = false
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([name, source]) => {
    try {
      return [name, await all(source)]
    } catch (err) {
      if (!OPTIONAL.has(name)) throw err
      if (BACK_OFFICE.has(name) && isMissingTable(err)) setupNeeded = true
      else restricted.push(name)
      return [name, []]
    }
  }))
  return { raw: Object.fromEntries(entries), restricted, setupNeeded }
}

/**
 * Blossom's activity log: every action anyone took, in plain words (owner only).
 * Loaded on demand for one period because it can be long.
 */
export async function loadActivity(start, end) {
  const from = new Date(`${start}T00:00:00+01:00`).toISOString()
  const to = new Date(new Date(`${end}T00:00:00+01:00`).getTime() + 86400000).toISOString()
  const { data, error } = await supabase.rpc('blossom_activity_feed', { p_from: from, p_to: to, p_actor: null, p_kind: null, p_limit: 5000 })
  if (error) throw new Error(/permission|owner|42501/i.test(error.message || '') ? 'Only owner accounts can see the activity log.' : error.message)
  return data || []
}

/** Blossom lets staff sign in with a username; resolve it to the account email. */
export async function emailForUsername(identifier) {
  const value = String(identifier || '').trim()
  if (!value || value.includes('@')) return value
  const { data, error } = await supabase.rpc('email_for_username', { p_username: value })
  if (error) throw new Error('Could not reach the server. Check your connection.')
  return data || null
}
