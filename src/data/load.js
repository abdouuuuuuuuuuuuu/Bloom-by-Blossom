// Read-only data access. Bloom never inserts, updates or deletes anything:
// every call is a SELECT, plus the username lookup used at sign-in.
import { supabase } from '../lib/supabase.js'

const PAGE = 1000

const SOURCES = {
  orders: { table: 'orders', order: 'created_at', filter: (q) => q.is('deleted_at', null),
    columns: 'id,order_number,created_at,status,order_type,payment_method,payment_status,client_source,client_name,client_phone,customer_id,total_amount,amount_paid,amount_due,price_adjustment,delivery_method,delivery_date,delivery_time,delivery_wilaya,delivery_city,original_delivery_date,delay_reason,delay_history,delivered_at,created_by,cashier_id,voided_at,void_reason,notes,deleted_at' },
  items: { table: 'order_items', order: 'id', columns: 'id,order_id,product_id,product_name,product_image,quantity,unit_price,total_price,category,flower_type,color' },
  products: { table: 'products', order: 'product_id', columns: 'product_id,item_name,category,flower_type,color,retail_price,stock_level,low_stock_threshold,supplier_id,is_active,image_url' },
  purchases: { table: 'supplier_transactions', order: 'transaction_id', filter: (q) => q.is('voided_at', null), columns: 'transaction_id,supplier_id,product_id,quantity,unit_cost,total_cost,amount_paid,amount_due,payment_status,transaction_date,transaction_type,received_at,created_at' },
  cash: { table: 'cash_register', order: 'id', filter: (q) => q.eq('transaction_type', 'cash_out'), columns: 'id,transaction_type,amount,description,category,register_date,payment_method,created_at' },
  suppliers: { table: 'suppliers', order: 'supplier_id', columns: 'supplier_id,company_name,contact_person,phone' },
  adjustments: { table: 'stock_adjustments', order: 'id', filter: (q) => q.eq('adjustment_type', 'removal'), columns: 'id,product_id,adjustment_type,quantity,reason,created_at' },
  waste: { table: 'flower_waste', order: 'id', columns: 'id,product_id,quantity,reason,waste_date' },
  settings: { table: 'settings', order: 'id', columns: 'daily_target,shop_name' },
  profiles: { table: 'profiles', order: 'id', columns: 'id,full_name,username,role' },
}

/** Tables Bloom can work without; a permission error there is shown, not fatal. */
const OPTIONAL = new Set(['purchases', 'cash', 'suppliers', 'adjustments', 'waste', 'settings'])

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

/** Everything Bloom needs, in one go. Returns { raw, restricted: [names of tables we could not read] }. */
export async function loadAll() {
  // Dev only: `npm run dev` + ?fixture loads a local JSON snapshot instead (never in the built app).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
    return { raw: await (await fetch('/__fixture.json')).json(), restricted: [] }
  }
  const restricted = []
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([name, source]) => {
    try {
      return [name, await all(source)]
    } catch (err) {
      if (!OPTIONAL.has(name)) throw err
      restricted.push(name)
      return [name, []]
    }
  }))
  return { raw: Object.fromEntries(entries), restricted }
}

/** Blossom lets staff sign in with a username; resolve it to the account email. */
export async function emailForUsername(identifier) {
  const value = String(identifier || '').trim()
  if (!value || value.includes('@')) return value
  const { data, error } = await supabase.rpc('email_for_username', { p_username: value })
  if (error) throw new Error('Could not reach the server. Check your connection.')
  return data || null
}
