-- The shop's rulebook: every number Blossom shows is defined here, once.
--
-- The till, the back office and the phone app read these views and
-- functions instead of adding things up on their own, so they always agree.
--
-- Needs bloom-back-office.sql first (expenses and staff tables).
-- Apply by hand in the Supabase SQL Editor (this project never uses
-- `supabase db push`). Safe to run more than once. One transaction.
-- Adds views and functions only: no table, row or existing function changes.
--
-- The rules, in plain words
--   A sale counts       unless the order is deleted, voided, cancelled or refunded.
--   The shop day        is the date in Algiers.
--   The shop week       runs Saturday to Friday; the books close on Friday.
--   A product's cost    is the average price paid to suppliers, weighted by
--                       quantity, ignoring purchases typed 5× too high (above
--                       5× the selling price, or 5× the product's usual price
--                       once it was bought 3 times). Without purchases, the
--                       product's wholesale_cost if it is above 0.
--   A cost (expense)    is a till cash-out that is not a refund, correction,
--                       order reversal or money banked overnight; plus
--                       expenses paid outside the till; plus staff pay that
--                       did not come from the till (that pay is already a
--                       till cash-out).
--   Waste               is flower waste plus stock removed by hand (not for
--                       an order), valued at the product's cost.
--   A supplier payment  is counted from supplier_payments only (never from
--                       supplier_transactions.amount_paid, which mirrors it).

BEGIN;

-- ─── Basic rules ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_is_counted_sale(p_status text, p_payment_status text, p_voided_at timestamptz, p_deleted_at timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_deleted_at IS NULL
     AND p_voided_at IS NULL
     AND coalesce(p_status, '') <> 'cancelled'
     AND coalesce(p_payment_status, '') <> 'refunded'
$$;

CREATE OR REPLACE FUNCTION public.shop_day(p_at timestamptz)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (p_at AT TIME ZONE 'Africa/Algiers')::date
$$;

/** The Friday that closes the week containing p_day (Saturday → Friday). */
CREATE OR REPLACE FUNCTION public.shop_week_ending(p_day date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT p_day + ((5 - extract(isodow FROM p_day)::int + 7) % 7)
$$;

/** What a till line is, in shop words. */
CREATE OR REPLACE FUNCTION public.shop_till_kind(p_type text, p_category text, p_description text, p_has_order boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_type = 'cash_in' AND (p_has_order OR lower(coalesce(p_category, '') || ' ' || coalesce(p_description, '')) ~ '(order|sale|payment)') THEN 'sale_payment'
    WHEN p_type = 'cash_in' THEN 'cash_in'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_description, '')) ~ 'banked' THEN 'banked'
    WHEN lower(coalesce(p_category, '')) IN ('refund') OR lower(coalesce(p_description, '')) ~ '^refund' THEN 'refund'
    WHEN lower(coalesce(p_category, '')) ~ 'reversal' THEN 'reversal'
    WHEN lower(coalesce(p_category, '')) ~ 'adjust' THEN 'correction'
    ELSE 'expense'
  END
$$;

-- ─── Orders and what they sold ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.shop_orders WITH (security_invoker = true) AS
SELECT
  o.id,
  o.order_number,
  o.created_at,
  public.shop_day(o.created_at) AS day,
  public.shop_is_counted_sale(o.status, o.payment_status, o.voided_at, o.deleted_at) AS counted,
  o.status,
  o.payment_status,
  o.order_type,
  o.client_source AS channel,
  o.payment_method,
  coalesce(o.total_amount, 0)::numeric AS value,
  least(coalesce(o.amount_paid, 0), coalesce(o.total_amount, 0))::numeric AS paid,
  CASE WHEN o.amount_due IS NOT NULL THEN greatest(o.amount_due, 0)
       ELSE greatest(coalesce(o.total_amount, 0) - coalesce(o.amount_paid, 0), 0) END::numeric AS due,
  greatest(-coalesce(o.price_adjustment, 0), 0)::numeric AS discount,
  coalesce(o.created_by, o.cashier_id) AS staff_id,
  o.customer_id,
  o.client_name,
  o.client_phone
FROM public.orders o
WHERE o.deleted_at IS NULL;

-- Supplier deliveries, with the "typed 5× too high" check.
CREATE OR REPLACE VIEW public.shop_purchases WITH (security_invoker = true) AS
WITH p AS (
  SELECT
    st.transaction_id,
    st.supplier_id,
    st.product_id,
    coalesce(st.quantity, 0)::numeric AS qty,
    coalesce(nullif(st.unit_cost, 0)::numeric, CASE WHEN st.quantity > 0 THEN st.total_cost::numeric / st.quantity END, 0) AS unit_cost,
    coalesce(st.transaction_date, public.shop_day(coalesce(st.received_at, st.created_at))) AS day
  FROM public.supplier_transactions st
  WHERE st.voided_at IS NULL AND coalesce(st.transaction_type, 'purchase') = 'purchase'
), stats AS (
  SELECT product_id, count(*) AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_cost) FILTER (WHERE unit_cost > 0) AS usual
  FROM p GROUP BY product_id
)
SELECT
  p.transaction_id, p.supplier_id, p.product_id, p.qty, p.unit_cost, p.day,
  p.qty * p.unit_cost AS total,
  (   (coalesce(pr.retail_price, 0) > 0 AND p.unit_cost > pr.retail_price * 5)
   OR (s.n >= 3 AND s.usual > 0 AND p.unit_cost > s.usual * 5)) AS suspicious
FROM p
JOIN stats s USING (product_id)
LEFT JOIN public.products pr ON pr.product_id = p.product_id;

CREATE OR REPLACE VIEW public.shop_product_cost WITH (security_invoker = true) AS
WITH agg AS (
  SELECT product_id,
    sum(qty * unit_cost) FILTER (WHERE NOT suspicious AND qty > 0 AND unit_cost > 0)
      / nullif(sum(qty) FILTER (WHERE NOT suspicious AND qty > 0 AND unit_cost > 0), 0) AS bought_cost,
    (array_agg(unit_cost ORDER BY day DESC, transaction_id DESC) FILTER (WHERE NOT suspicious AND unit_cost > 0))[1] AS last_cost,
    (array_agg(supplier_id ORDER BY day DESC, transaction_id DESC) FILTER (WHERE NOT suspicious))[1] AS last_supplier_id,
    max(day) AS last_purchase_day,
    count(*) FILTER (WHERE suspicious) AS suspicious_purchases
  FROM public.shop_purchases GROUP BY product_id
)
SELECT
  pr.product_id,
  coalesce(a.bought_cost, nullif(pr.wholesale_cost, 0)::numeric) AS avg_cost,
  CASE WHEN a.bought_cost IS NOT NULL THEN 'purchases'
       WHEN coalesce(pr.wholesale_cost, 0) > 0 THEN 'manual' END AS cost_source,
  a.last_cost,
  a.last_supplier_id,
  a.last_purchase_day,
  coalesce(a.suspicious_purchases, 0) AS suspicious_purchases
FROM public.products pr
LEFT JOIN agg a ON a.product_id = pr.product_id;

CREATE OR REPLACE VIEW public.shop_sales_lines WITH (security_invoker = true) AS
SELECT
  oi.id,
  o.id AS order_id,
  o.day,
  oi.product_id,
  coalesce(oi.quantity, 0)::numeric AS qty,
  coalesce(nullif(oi.total_price, 0), coalesce(oi.quantity, 0) * coalesce(oi.unit_price, 0))::numeric AS value,
  c.avg_cost AS unit_cost,
  c.avg_cost * coalesce(oi.quantity, 0) AS cost
FROM public.order_items oi
JOIN public.shop_orders o ON o.id = oi.order_id
LEFT JOIN public.shop_product_cost c ON c.product_id = oi.product_id
WHERE o.counted;

-- ─── Every money movement, each exactly once ──────────────────────────────
-- direction: 'in' or 'out'. amount: always positive.
-- counts_as_cost: true for lines that are a running cost of the shop.
CREATE OR REPLACE VIEW public.shop_money_ledger WITH (security_invoker = true) AS
SELECT
  'till'::text AS source,
  c.id::text AS ref,
  coalesce(c.register_date, public.shop_day(c.created_at)) AS day,
  c.created_at AS at,
  CASE WHEN c.transaction_type = 'cash_in' THEN 'in' ELSE 'out' END AS direction,
  coalesce(c.amount, 0)::numeric AS amount,
  public.shop_till_kind(c.transaction_type, c.category, c.description, c.order_id IS NOT NULL) AS kind,
  coalesce(nullif(trim(c.category), ''), CASE WHEN c.transaction_type = 'cash_in' THEN 'Sales' ELSE 'Other' END) AS category,
  coalesce(c.description, '') AS description,
  coalesce(c.payment_method, 'cash') AS method,
  c.order_id,
  coalesce(c.created_by, c.user_id) AS actor_id,
  NULL::integer AS supplier_id,
  NULL::bigint AS staff_id,
  (c.transaction_type = 'cash_out' AND public.shop_till_kind(c.transaction_type, c.category, c.description, c.order_id IS NOT NULL) = 'expense') AS counts_as_cost
FROM public.cash_register c
WHERE c.transaction_type IN ('cash_in', 'cash_out')
UNION ALL
SELECT
  'supplier', sp.payment_id::text, public.shop_day(coalesce(sp.paid_at, sp.created_at)), coalesce(sp.paid_at, sp.created_at),
  'out', coalesce(sp.amount, 0)::numeric, 'supplier_payment', coalesce(s.company_name, 'Supplier'), coalesce(sp.notes, ''),
  coalesce(sp.payment_method, 'cash'), NULL::uuid, NULL::uuid, sp.supplier_id, NULL::bigint, false
FROM public.supplier_payments sp
LEFT JOIN public.suppliers s ON s.supplier_id = sp.supplier_id
UNION ALL
SELECT
  'office', e.id::text, e.spent_on, e.created_at,
  'out', e.amount::numeric, 'expense', e.category, e.description,
  e.payment_method, NULL::uuid, e.created_by, e.supplier_id, NULL::bigint, true
FROM public.bloom_expenses e
WHERE e.voided_at IS NULL
UNION ALL
SELECT
  'staff', p.id::text, p.paid_on, p.created_at,
  'out', p.amount::numeric, p.kind, st.full_name, p.notes,
  p.payment_method, NULL::uuid, p.created_by, NULL::integer, p.staff_id,
  -- Pay taken from the till is already a till cash-out: listed, never counted twice.
  NOT p.from_register
FROM public.bloom_staff_payments p
JOIN public.bloom_staff st ON st.id = p.staff_id
WHERE p.voided_at IS NULL AND p.kind <> 'deduction';

-- ─── The till, one row per day ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.shop_till_days WITH (security_invoker = true) AS
WITH d AS (
  SELECT
    c.register_date AS day,
    (array_agg(c.amount ORDER BY c.created_at) FILTER (WHERE c.transaction_type = 'opening'))[1] AS opening,
    (array_agg(coalesce(c.created_by, c.user_id) ORDER BY c.created_at) FILTER (WHERE c.transaction_type = 'opening'))[1] AS opened_by,
    min(c.created_at) FILTER (WHERE c.transaction_type = 'opening') AS opened_at,
    coalesce(sum(c.amount) FILTER (WHERE c.transaction_type = 'cash_in'), 0) AS money_in,
    coalesce(sum(c.amount) FILTER (WHERE c.transaction_type = 'cash_out'), 0) AS money_out,
    count(*) FILTER (WHERE c.transaction_type = 'cash_in') AS ins,
    count(*) FILTER (WHERE c.transaction_type = 'cash_out') AS outs,
    coalesce(sum(c.amount) FILTER (WHERE c.transaction_type = 'cash_out'
      AND lower(coalesce(c.category, '') || ' ' || coalesce(c.description, '')) ~ 'banked'), 0) AS banked_lines,
    (array_agg(c.id ORDER BY c.created_at DESC) FILTER (WHERE c.transaction_type = 'closing'))[1] AS closing_id
  FROM public.cash_register c
  WHERE c.register_date IS NOT NULL
  GROUP BY c.register_date
)
SELECT
  d.day,
  d.opening,
  d.opened_by,
  d.opened_at,
  d.money_in,
  d.money_out,
  d.ins,
  d.outs,
  coalesce(d.opening, 0) + d.money_in - d.money_out AS expected,
  cl.amount AS closing,
  coalesce(cl.banked_overnight, d.banked_lines) AS banked,
  cl.counted_cash,
  cl.counted_baridimob,
  cl.counted_usd,
  coalesce(cl.created_by, cl.user_id) AS closed_by,
  cl.created_at AS closed_at,
  -- The closing amount is the float left after banking; banking is one of the cash-outs.
  cl.amount - (coalesce(d.opening, 0) + d.money_in - d.money_out) AS difference
FROM d
LEFT JOIN public.cash_register cl ON cl.id = d.closing_id;

-- ─── Every stock movement ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.shop_stock_ledger WITH (security_invoker = true) AS
SELECT
  'adjustment'::text AS source,
  a.id::text AS ref,
  public.shop_day(a.created_at) AS day,
  a.created_at AS at,
  a.product_id,
  coalesce(a.adjustment_type, '') AS kind,
  CASE WHEN a.previous_stock IS NOT NULL AND a.new_stock IS NOT NULL THEN a.new_stock - a.previous_stock
       WHEN a.adjustment_type = 'removal' THEN -abs(coalesce(a.quantity, 0))
       ELSE coalesce(a.quantity, 0) END::numeric AS change,
  a.previous_stock AS before,
  a.new_stock AS after,
  coalesce(a.reason, '') AS reason,
  a.created_by AS actor_id,
  -- Removed by hand (not for an order) counts as waste.
  (a.adjustment_type = 'removal' AND coalesce(a.reason, '') !~* '^order\s*#') AS is_waste
FROM public.stock_adjustments a
UNION ALL
SELECT
  'waste', w.id::text, w.waste_date, NULL::timestamptz, w.product_id, 'waste',
  -coalesce(w.quantity, 0)::numeric, NULL::integer, NULL::integer, coalesce(w.reason, 'Waste'), w.created_by, true
FROM public.flower_waste w;

-- ─── Headline numbers for any period ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_period_summary(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_sales numeric; v_orders bigint; v_collected numeric; v_due numeric; v_discounts numeric;
  v_item_value numeric; v_costed_value numeric; v_cogs numeric; v_margin numeric; v_gross numeric;
  v_till numeric; v_office numeric; v_staff numeric; v_staff_from_till numeric; v_supplier_paid numeric;
  v_banked numeric; v_refunds numeric; v_waste numeric; v_purchased numeric; v_net numeric;
BEGIN
  IF NOT public.bloom_is_back_office() THEN
    RAISE EXCEPTION 'Only an owner or manager can see the shop''s accounts' USING errcode = '42501';
  END IF;

  SELECT coalesce(sum(value), 0), count(*), coalesce(sum(paid), 0), coalesce(sum(due), 0), coalesce(sum(discount), 0)
  INTO v_sales, v_orders, v_collected, v_due, v_discounts
  FROM shop_orders WHERE counted AND day BETWEEN p_from AND p_to;

  SELECT coalesce(sum(value), 0), coalesce(sum(value) FILTER (WHERE cost IS NOT NULL), 0), coalesce(sum(cost), 0)
  INTO v_item_value, v_costed_value, v_cogs
  FROM shop_sales_lines WHERE day BETWEEN p_from AND p_to;

  v_margin := CASE WHEN v_costed_value > 0 THEN (v_costed_value - v_cogs) / v_costed_value END;
  -- Items without a known cost are assumed to earn the same margin.
  v_gross := v_sales * v_margin;

  SELECT
    coalesce(sum(amount) FILTER (WHERE source = 'till' AND counts_as_cost), 0),
    coalesce(sum(amount) FILTER (WHERE source = 'office'), 0),
    coalesce(sum(amount) FILTER (WHERE source = 'staff' AND counts_as_cost), 0),
    coalesce(sum(amount) FILTER (WHERE source = 'staff' AND NOT counts_as_cost), 0),
    coalesce(sum(amount) FILTER (WHERE source = 'supplier'), 0),
    coalesce(sum(amount) FILTER (WHERE source = 'till' AND kind = 'banked'), 0),
    coalesce(sum(amount) FILTER (WHERE source = 'till' AND kind = 'refund'), 0)
  INTO v_till, v_office, v_staff, v_staff_from_till, v_supplier_paid, v_banked, v_refunds
  FROM shop_money_ledger WHERE day BETWEEN p_from AND p_to;

  SELECT coalesce(sum(-l.change * c.avg_cost), 0) INTO v_waste
  FROM shop_stock_ledger l JOIN shop_product_cost c ON c.product_id = l.product_id
  WHERE l.is_waste AND l.day BETWEEN p_from AND p_to AND c.avg_cost IS NOT NULL;

  SELECT coalesce(sum(total), 0) INTO v_purchased
  FROM shop_purchases WHERE NOT suspicious AND day BETWEEN p_from AND p_to;

  v_net := v_gross - v_till - v_office - v_staff - v_waste;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales', v_sales, 'orders', v_orders, 'collected', v_collected, 'customers_owe', v_due, 'discounts', v_discounts,
    'cost_of_goods', v_sales - coalesce(v_gross, v_sales),
    'cost_coverage', CASE WHEN v_item_value > 0 THEN v_costed_value / v_item_value END,
    'gross_profit', v_gross,
    'gross_margin', CASE WHEN v_sales > 0 AND v_gross IS NOT NULL THEN v_gross / v_sales END,
    'till_costs', v_till, 'office_costs', v_office, 'staff_costs', v_staff, 'staff_paid_from_till', v_staff_from_till,
    'waste_cost', v_waste,
    'running_costs', v_till + v_office + v_staff + v_waste,
    'net_profit', v_net,
    'net_margin', CASE WHEN v_sales > 0 AND v_net IS NOT NULL THEN v_net / v_sales END,
    'purchased', v_purchased,
    'paid_to_suppliers', v_supplier_paid,
    'banked', v_banked,
    'refunds', v_refunds,
    'cash_result', v_collected - v_supplier_paid - v_till - v_office - v_staff
  );
END;
$$;

-- ─── The Friday closing (Saturday → Friday) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_friday_closing(p_friday date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_today  date := public.shop_day(now());
  v_end    date := public.shop_week_ending(coalesce(p_friday, v_today));
  v_start  date := v_end - 6;
  v_prev_end date;
  v_days   jsonb;
BEGIN
  -- While the week is still running, compare with the same days of last week.
  v_prev_end := CASE WHEN v_today BETWEEN v_start AND v_end THEN v_today - 7 ELSE v_end - 7 END;

  SELECT jsonb_agg(jsonb_build_object(
    'day', g.day,
    'orders', (SELECT count(*) FROM shop_orders o WHERE o.counted AND o.day = g.day),
    'sales', (SELECT coalesce(sum(value), 0) FROM shop_orders o WHERE o.counted AND o.day = g.day),
    'collected', (SELECT coalesce(sum(paid), 0) FROM shop_orders o WHERE o.counted AND o.day = g.day),
    'spent', (SELECT coalesce(sum(amount), 0) FROM shop_money_ledger m WHERE m.counts_as_cost AND m.day = g.day)
  ) ORDER BY g.day)
  INTO v_days
  FROM (SELECT gs::date AS day FROM generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') AS gs) AS g;

  RETURN jsonb_build_object(
    'week_start', v_start,
    'week_end', v_end,
    'running', v_today BETWEEN v_start AND v_end,
    'summary', public.shop_period_summary(v_start, v_end),
    'previous', public.shop_period_summary(v_start - 7, v_prev_end),
    'days', coalesce(v_days, '[]'::jsonb)
  );
END;
$$;

GRANT SELECT ON public.shop_orders, public.shop_purchases, public.shop_product_cost, public.shop_sales_lines,
  public.shop_money_ledger, public.shop_till_days, public.shop_stock_ledger TO authenticated;
REVOKE ALL ON public.shop_orders, public.shop_purchases, public.shop_product_cost, public.shop_sales_lines,
  public.shop_money_ledger, public.shop_till_days, public.shop_stock_ledger FROM anon;
REVOKE ALL ON FUNCTION public.shop_period_summary(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shop_friday_closing(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_period_summary(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_friday_closing(date) TO authenticated;

COMMIT;

-- Check: this week's Friday closing (run while signed in as owner in the app,
-- or here in the SQL Editor where it reports a permission error, which is expected).
-- SELECT public.shop_friday_closing();
