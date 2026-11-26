-- Bloom back office: expenses, staff & payroll, attendance, purchase orders.
--
-- Apply by hand in the Supabase SQL Editor (this project never uses
-- `supabase db push`). Safe to run more than once. One transaction.
--
-- Nothing here changes an existing Blossom table or function: the POS keeps
-- working exactly as before. Bloom reads these tables and the POS ignores them.
--
-- Who can do what
--   owner + manager : expenses, purchase orders, staff list, attendance
--   owner only      : staff payments (salaries, advances, bonuses)

BEGIN;

-- ─── Role helpers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bloom_is_back_office()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND coalesce(is_active, true) AND role IN ('owner', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.bloom_is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND coalesce(is_active, true) AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.bloom_is_back_office() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bloom_is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bloom_is_back_office() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bloom_is_owner() TO authenticated;

-- ─── Expenses paid outside the till (rent, electricity, bank transfers…) ──
-- Cash taken from the till is already in cash_register; it is not entered here.
CREATE TABLE IF NOT EXISTS public.bloom_expenses (
  id             bigserial PRIMARY KEY,
  spent_on       date        NOT NULL DEFAULT current_date,
  category       text        NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 60),
  description    text        NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  amount         integer     NOT NULL CHECK (amount > 0),
  payment_method text        NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'card', 'ccp', 'cheque', 'other')),
  supplier_id    integer     REFERENCES public.suppliers(supplier_id),
  created_by     uuid        DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  voided_at      timestamptz,
  void_reason    text
);
CREATE INDEX IF NOT EXISTS bloom_expenses_spent_on_idx ON public.bloom_expenses (spent_on);

-- ─── Staff ────────────────────────────────────────────────────────────────
-- A person on the payroll. profile_id links to their Blossom login, if any
-- (couriers or part-timers may have none).
CREATE TABLE IF NOT EXISTS public.bloom_staff (
  id             bigserial PRIMARY KEY,
  full_name      text        NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 100),
  job_title      text        NOT NULL DEFAULT '' CHECK (length(job_title) <= 60),
  phone          text        NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  profile_id     uuid        UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  monthly_salary integer     NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  started_on     date,
  ended_on       date,
  is_active      boolean     NOT NULL DEFAULT true,
  notes          text        NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Salary, advance and bonus are money handed over; deduction lowers what is
-- owed (lateness, breakage). for_month is the month the payment belongs to.
-- from_register = the cash came out of the till and is already recorded as a
-- cash-out in Blossom, so Bloom does not count it a second time in costs.
CREATE TABLE IF NOT EXISTS public.bloom_staff_payments (
  id             bigserial PRIMARY KEY,
  staff_id       bigint      NOT NULL REFERENCES public.bloom_staff(id),
  kind           text        NOT NULL CHECK (kind IN ('salary', 'advance', 'bonus', 'deduction')),
  for_month      text        NOT NULL CHECK (for_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount         integer     NOT NULL CHECK (amount > 0),
  paid_on        date        NOT NULL DEFAULT current_date,
  payment_method text        NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'card', 'ccp', 'cheque', 'other')),
  from_register  boolean     NOT NULL DEFAULT false,
  notes          text        NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
  created_by     uuid        DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  voided_at      timestamptz,
  void_reason    text
);
CREATE INDEX IF NOT EXISTS bloom_staff_payments_month_idx ON public.bloom_staff_payments (for_month);

CREATE TABLE IF NOT EXISTS public.bloom_attendance (
  staff_id   bigint      NOT NULL REFERENCES public.bloom_staff(id) ON DELETE CASCADE,
  day        date        NOT NULL,
  status     text        NOT NULL CHECK (status IN ('present', 'absent', 'half', 'leave', 'off')),
  note       text        NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  updated_by uuid        DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, day)
);

-- ─── Purchase orders ──────────────────────────────────────────────────────
-- What you plan to buy from a supplier. Receiving one runs Blossom's own
-- receive_supplier_stock, so stock, supplier debt and audit log are updated
-- exactly as when a delivery is entered at the till.
CREATE TABLE IF NOT EXISTS public.bloom_purchase_orders (
  id              bigserial PRIMARY KEY,
  supplier_id     integer     NOT NULL REFERENCES public.suppliers(supplier_id),
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  expected_on     date,
  notes           text        NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_by      uuid        DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  received_at     timestamptz,
  received_by     uuid,
  receive_result  jsonb
);

CREATE TABLE IF NOT EXISTS public.bloom_purchase_order_lines (
  id         bigserial PRIMARY KEY,
  po_id      bigint  NOT NULL REFERENCES public.bloom_purchase_orders(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES public.products(product_id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_cost  integer NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);
CREATE INDEX IF NOT EXISTS bloom_po_lines_po_idx ON public.bloom_purchase_order_lines (po_id);

-- ─── Row level security ───────────────────────────────────────────────────
ALTER TABLE public.bloom_expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloom_staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloom_staff_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloom_attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloom_purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloom_purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bloom_back_office ON public.bloom_expenses;
CREATE POLICY bloom_back_office ON public.bloom_expenses FOR ALL TO authenticated
  USING (public.bloom_is_back_office()) WITH CHECK (public.bloom_is_back_office());

DROP POLICY IF EXISTS bloom_back_office ON public.bloom_staff;
CREATE POLICY bloom_back_office ON public.bloom_staff FOR ALL TO authenticated
  USING (public.bloom_is_back_office()) WITH CHECK (public.bloom_is_back_office());

DROP POLICY IF EXISTS bloom_owner_only ON public.bloom_staff_payments;
CREATE POLICY bloom_owner_only ON public.bloom_staff_payments FOR ALL TO authenticated
  USING (public.bloom_is_owner()) WITH CHECK (public.bloom_is_owner());

DROP POLICY IF EXISTS bloom_back_office ON public.bloom_attendance;
CREATE POLICY bloom_back_office ON public.bloom_attendance FOR ALL TO authenticated
  USING (public.bloom_is_back_office()) WITH CHECK (public.bloom_is_back_office());

DROP POLICY IF EXISTS bloom_back_office ON public.bloom_purchase_orders;
CREATE POLICY bloom_back_office ON public.bloom_purchase_orders FOR ALL TO authenticated
  USING (public.bloom_is_back_office()) WITH CHECK (public.bloom_is_back_office());

DROP POLICY IF EXISTS bloom_back_office ON public.bloom_purchase_order_lines;
CREATE POLICY bloom_back_office ON public.bloom_purchase_order_lines FOR ALL TO authenticated
  USING (public.bloom_is_back_office()) WITH CHECK (public.bloom_is_back_office());

REVOKE ALL ON public.bloom_expenses, public.bloom_staff, public.bloom_staff_payments, public.bloom_attendance,
  public.bloom_purchase_orders, public.bloom_purchase_order_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloom_expenses, public.bloom_staff, public.bloom_staff_payments,
  public.bloom_attendance, public.bloom_purchase_orders, public.bloom_purchase_order_lines TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.bloom_expenses_id_seq, public.bloom_staff_id_seq, public.bloom_staff_payments_id_seq,
  public.bloom_purchase_orders_id_seq, public.bloom_purchase_order_lines_id_seq TO authenticated;

-- ─── Receive a purchase order ─────────────────────────────────────────────
-- Locks the order so two clicks (or two computers) cannot receive it twice,
-- then records the delivery through receive_supplier_stock (owner only, as at
-- the till). p_lines lets you correct quantities/costs on arrival; NULL uses
-- the order's own lines.
CREATE OR REPLACE FUNCTION public.bloom_receive_purchase_order(p_po_id bigint, p_lines jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_po     public.bloom_purchase_orders%ROWTYPE;
  v_items  jsonb;
  v_result jsonb;
BEGIN
  IF NOT public.bloom_is_owner() THEN
    RAISE EXCEPTION 'Only an owner can receive stock' USING errcode = '42501';
  END IF;

  SELECT * INTO v_po FROM public.bloom_purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That purchase order no longer exists.';
  END IF;
  IF v_po.status = 'received' THEN
    RETURN coalesce(v_po.receive_result, '{}'::jsonb) || jsonb_build_object('already_received', true);
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'That purchase order was cancelled.';
  END IF;

  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'product_id', (l->>'product_id')::int,
      'quantity',   (l->>'quantity')::int,
      'unit_cost',  round((l->>'unit_cost')::numeric)::int,
      'notes',      'PO #' || v_po.id))
    INTO v_items
    FROM jsonb_array_elements(p_lines) l
    WHERE (l->>'quantity')::int > 0;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'quantity', quantity, 'unit_cost', unit_cost, 'notes', 'PO #' || v_po.id) ORDER BY id)
    INTO v_items
    FROM public.bloom_purchase_order_lines WHERE po_id = v_po.id;
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Nothing to receive: every line has zero quantity.';
  END IF;

  v_result := public.receive_supplier_stock(v_po.supplier_id, v_items);

  UPDATE public.bloom_purchase_orders
  SET status = 'received', received_at = now(), received_by = auth.uid(), receive_result = v_result
  WHERE id = v_po.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.bloom_receive_purchase_order(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bloom_receive_purchase_order(bigint, jsonb) TO authenticated;

COMMIT;

-- Check: should list the 6 tables.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'bloom\_%' ORDER BY 1;
