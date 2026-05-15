-- ============================================================
-- 065_pos_module.sql
-- Full Point of Sale module: registers, shifts, orders, items,
-- modifiers, payments, kitchen, settings, inventory recipes,
-- and POS inventory movements. Idempotent and RLS-safe.
-- ============================================================

-- ── Ensure updated_at function exists ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ── Helper: get calling user's tenant_id ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM public.users
  WHERE auth_user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

-- ── Helper: check if user belongs to a tenant ────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_has_tenant_access(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND status = 'active'
  );
$$;

-- ── Helper: check user role in a tenant ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_has_role(p_tenant_id uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role = ANY(allowed_roles)
      AND status = 'active'
  );
$$;

-- ── inventory_recipes (recipe/ingredient links for POS) ───────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_recipes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_item_id   uuid        NOT NULL,
  quantity_required   numeric     NOT NULL DEFAULT 1,
  unit                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, product_id, inventory_item_id)
);

DROP TRIGGER IF EXISTS inventory_recipes_updated_at ON public.inventory_recipes;
CREATE TRIGGER inventory_recipes_updated_at
  BEFORE UPDATE ON public.inventory_recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── A) pos_registers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_registers (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                    text        NOT NULL,
  location_name           text,
  register_code           text,
  status                  text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive','archived')),
  cash_tracking_enabled   boolean     NOT NULL DEFAULT false,
  starting_cash_cents     integer     NOT NULL DEFAULT 0,
  current_cash_cents      integer     NOT NULL DEFAULT 0,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_registers_updated_at ON public.pos_registers;
CREATE TRIGGER pos_registers_updated_at
  BEFORE UPDATE ON public.pos_registers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── B) pos_shifts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_shifts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  register_id           uuid        REFERENCES public.pos_registers(id) ON DELETE SET NULL,
  opened_by             uuid        NOT NULL,
  closed_by             uuid,
  status                text        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','cancelled')),
  opened_at             timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  starting_cash_cents   integer     NOT NULL DEFAULT 0,
  expected_cash_cents   integer     NOT NULL DEFAULT 0,
  counted_cash_cents    integer,
  cash_difference_cents integer,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_shifts_updated_at ON public.pos_shifts;
CREATE TRIGGER pos_shifts_updated_at
  BEFORE UPDATE ON public.pos_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── C) pos_orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_orders (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number          text        NOT NULL,
  channel               text        NOT NULL DEFAULT 'pos'
                        CHECK (channel IN ('pos','online','phone','kiosk','delivery','pickup')),
  order_type            text        NOT NULL DEFAULT 'in_person'
                        CHECK (order_type IN ('in_person','dine_in','takeout','pickup','delivery','appointment','custom')),
  status                text        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','open','sent_to_kitchen','preparing','ready','completed','cancelled','refunded','partially_refunded')),
  payment_status        text        NOT NULL DEFAULT 'unpaid'
                        CHECK (payment_status IN ('unpaid','partially_paid','paid','refunded','partially_refunded','failed')),
  fulfillment_status    text        NOT NULL DEFAULT 'not_started'
                        CHECK (fulfillment_status IN ('not_started','preparing','ready','fulfilled','cancelled')),
  customer_id           uuid        REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_account_id   uuid        REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
  register_id           uuid        REFERENCES public.pos_registers(id) ON DELETE SET NULL,
  shift_id              uuid        REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
  appointment_id        uuid,
  table_name            text,
  guest_count           integer,
  cashier_user_id       uuid,
  assigned_employee_id  uuid,
  subtotal_cents        integer     NOT NULL DEFAULT 0,
  discount_cents        integer     NOT NULL DEFAULT 0,
  tax_cents             integer     NOT NULL DEFAULT 0,
  tip_cents             integer     NOT NULL DEFAULT 0,
  service_fee_cents     integer     NOT NULL DEFAULT 0,
  total_cents           integer     NOT NULL DEFAULT 0,
  amount_paid_cents     integer     NOT NULL DEFAULT 0,
  balance_due_cents     integer     NOT NULL DEFAULT 0,
  currency              text        NOT NULL DEFAULT 'USD',
  notes                 text,
  internal_notes        text,
  kitchen_notes         text,
  source_metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  refunded_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

DROP TRIGGER IF EXISTS pos_orders_updated_at ON public.pos_orders;
CREATE TRIGGER pos_orders_updated_at
  BEFORE UPDATE ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── D) pos_order_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_order_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id              uuid        NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  product_id            uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  inventory_item_id     uuid,
  name                  text        NOT NULL,
  sku                   text,
  item_type             text        NOT NULL DEFAULT 'product'
                        CHECK (item_type IN ('product','service','custom','fee','discount')),
  quantity              numeric     NOT NULL DEFAULT 1,
  unit_price_cents      integer     NOT NULL DEFAULT 0,
  base_price_cents      integer     NOT NULL DEFAULT 0,
  modifier_total_cents  integer     NOT NULL DEFAULT 0,
  discount_cents        integer     NOT NULL DEFAULT 0,
  tax_cents             integer     NOT NULL DEFAULT 0,
  total_cents           integer     NOT NULL DEFAULT 0,
  taxable               boolean     NOT NULL DEFAULT true,
  tax_rate              numeric,
  fulfillment_status    text        NOT NULL DEFAULT 'not_started'
                        CHECK (fulfillment_status IN ('not_started','sent_to_kitchen','preparing','ready','fulfilled','cancelled')),
  notes                 text,
  kitchen_notes         text,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_order_items_updated_at ON public.pos_order_items;
CREATE TRIGGER pos_order_items_updated_at
  BEFORE UPDATE ON public.pos_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── E) pos_modifier_groups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_modifier_groups (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                      text        NOT NULL,
  description               text,
  selection_type            text        NOT NULL DEFAULT 'multiple'
                            CHECK (selection_type IN ('single','multiple')),
  min_required              integer     NOT NULL DEFAULT 0,
  max_allowed               integer,
  is_required               boolean     NOT NULL DEFAULT false,
  applies_to_all_products   boolean     NOT NULL DEFAULT false,
  status                    text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','inactive','archived')),
  sort_order                integer     NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_modifier_groups_updated_at ON public.pos_modifier_groups;
CREATE TRIGGER pos_modifier_groups_updated_at
  BEFORE UPDATE ON public.pos_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── F) pos_modifiers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_modifiers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modifier_group_id     uuid        NOT NULL REFERENCES public.pos_modifier_groups(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  modifier_type         text        NOT NULL DEFAULT 'addon'
                        CHECK (modifier_type IN ('addon','removal','substitution','instruction','preparation')),
  price_delta_cents     integer     NOT NULL DEFAULT 0,
  inventory_item_id     uuid,
  affects_inventory     boolean     NOT NULL DEFAULT false,
  quantity_delta        numeric     NOT NULL DEFAULT 0,
  is_default            boolean     NOT NULL DEFAULT false,
  status                text        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','archived')),
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_modifiers_updated_at ON public.pos_modifiers;
CREATE TRIGGER pos_modifiers_updated_at
  BEFORE UPDATE ON public.pos_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── G) pos_product_modifier_groups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_product_modifier_groups (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  modifier_group_id   uuid        NOT NULL REFERENCES public.pos_modifier_groups(id) ON DELETE CASCADE,
  sort_order          integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, modifier_group_id)
);

-- ── H) pos_order_item_modifiers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_order_item_modifiers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_item_id       uuid        NOT NULL REFERENCES public.pos_order_items(id) ON DELETE CASCADE,
  modifier_group_id   uuid        REFERENCES public.pos_modifier_groups(id) ON DELETE SET NULL,
  modifier_id         uuid        REFERENCES public.pos_modifiers(id) ON DELETE SET NULL,
  name                text        NOT NULL,
  modifier_type       text        NOT NULL DEFAULT 'addon',
  quantity            numeric     NOT NULL DEFAULT 1,
  price_delta_cents   integer     NOT NULL DEFAULT 0,
  total_cents         integer     NOT NULL DEFAULT 0,
  inventory_item_id   uuid,
  affects_inventory   boolean     NOT NULL DEFAULT false,
  quantity_delta      numeric     NOT NULL DEFAULT 0,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── I) pos_payments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_payments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id              uuid        NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  payment_provider      text        NOT NULL DEFAULT 'manual'
                        CHECK (payment_provider IN ('manual','stripe','square','cash','external','gift_card','split')),
  payment_method        text        NOT NULL DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','card','tap','manual_card','gift_card','store_credit','split','other')),
  status                text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','authorized','paid','failed','refunded','partially_refunded','cancelled')),
  amount_cents          integer     NOT NULL,
  tip_cents             integer     NOT NULL DEFAULT 0,
  currency              text        NOT NULL DEFAULT 'USD',
  provider_payment_id   text,
  provider_checkout_url text,
  provider_response     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  collected_by          uuid,
  paid_at               timestamptz,
  refunded_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_payments_updated_at ON public.pos_payments;
CREATE TRIGGER pos_payments_updated_at
  BEFORE UPDATE ON public.pos_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── J) pos_refunds ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_refunds (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id            uuid        NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  payment_id          uuid        REFERENCES public.pos_payments(id) ON DELETE SET NULL,
  amount_cents        integer     NOT NULL,
  reason              text,
  status              text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','failed','cancelled')),
  provider_refund_id  text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_refunds_updated_at ON public.pos_refunds;
CREATE TRIGGER pos_refunds_updated_at
  BEFORE UPDATE ON public.pos_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── K) pos_discounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_discounts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                        text        NOT NULL,
  discount_type               text        NOT NULL
                              CHECK (discount_type IN ('percent','fixed_amount')),
  value                       numeric     NOT NULL,
  applies_to                  text        NOT NULL DEFAULT 'order'
                              CHECK (applies_to IN ('order','item')),
  requires_manager_approval   boolean     NOT NULL DEFAULT false,
  status                      text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','inactive','archived')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_discounts_updated_at ON public.pos_discounts;
CREATE TRIGGER pos_discounts_updated_at
  BEFORE UPDATE ON public.pos_discounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── L) pos_order_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_order_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id    uuid        NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  message     text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── M) pos_kitchen_tickets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_kitchen_tickets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id      uuid        NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','accepted','preparing','ready','completed','cancelled')),
  station       text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  ready_at      timestamptz,
  completed_at  timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_kitchen_tickets_updated_at ON public.pos_kitchen_tickets;
CREATE TRIGGER pos_kitchen_tickets_updated_at
  BEFORE UPDATE ON public.pos_kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── N) pos_settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_settings (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       uuid        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  default_tax_rate                numeric     NOT NULL DEFAULT 0,
  tips_enabled                    boolean     NOT NULL DEFAULT true,
  service_fee_enabled             boolean     NOT NULL DEFAULT false,
  service_fee_percent             numeric     NOT NULL DEFAULT 0,
  require_customer_for_order      boolean     NOT NULL DEFAULT false,
  allow_custom_items              boolean     NOT NULL DEFAULT true,
  allow_item_notes                boolean     NOT NULL DEFAULT true,
  allow_kitchen_notes             boolean     NOT NULL DEFAULT true,
  allow_discounts                 boolean     NOT NULL DEFAULT true,
  manager_approval_for_discounts  boolean     NOT NULL DEFAULT false,
  inventory_deduction_timing      text        NOT NULL DEFAULT 'payment_completed'
                                  CHECK (inventory_deduction_timing IN ('order_created','sent_to_kitchen','payment_completed','order_completed')),
  order_number_prefix             text        NOT NULL DEFAULT 'POS',
  next_order_number               integer     NOT NULL DEFAULT 1001,
  receipt_branding                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pos_settings_updated_at ON public.pos_settings;
CREATE TRIGGER pos_settings_updated_at
  BEFORE UPDATE ON public.pos_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── O) pos_inventory_movements ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_inventory_movements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id            uuid        NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  order_item_id       uuid        REFERENCES public.pos_order_items(id) ON DELETE CASCADE,
  modifier_id         uuid        REFERENCES public.pos_order_item_modifiers(id) ON DELETE CASCADE,
  inventory_item_id   uuid        NOT NULL,
  movement_type       text        NOT NULL DEFAULT 'sale'
                      CHECK (movement_type IN ('sale','refund','waste','adjustment')),
  quantity_delta      numeric     NOT NULL,
  unit                text,
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_registers_tenant         ON public.pos_registers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_tenant            ON public.pos_shifts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_register          ON public.pos_shifts (register_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant            ON public.pos_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status            ON public.pos_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_payment_status    ON public.pos_orders (tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_customer          ON public.pos_orders (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created           ON public.pos_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_order        ON public.pos_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_product      ON public.pos_order_items (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_pos_mod_groups_tenant        ON public.pos_modifier_groups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_modifiers_group          ON public.pos_modifiers (modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_pos_prod_mod_product         ON public.pos_product_modifier_groups (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_item_mods_item     ON public.pos_order_item_modifiers (order_item_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_order           ON public.pos_payments (order_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_status          ON public.pos_payments (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_tenant_status    ON public.pos_kitchen_tickets (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_order            ON public.pos_kitchen_tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_pos_inv_movements_order      ON public.pos_inventory_movements (order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_events_order       ON public.pos_order_events (order_id);
CREATE INDEX IF NOT EXISTS idx_inv_recipes_product          ON public.inventory_recipes (tenant_id, product_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_registers','pos_shifts','pos_orders','pos_order_items',
    'pos_modifier_groups','pos_modifiers','pos_product_modifier_groups',
    'pos_order_item_modifiers','pos_payments','pos_refunds','pos_discounts',
    'pos_order_events','pos_kitchen_tickets','pos_settings',
    'pos_inventory_movements','inventory_recipes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Service role bypass for all POS tables
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_registers','pos_shifts','pos_orders','pos_order_items',
    'pos_modifier_groups','pos_modifiers','pos_product_modifier_groups',
    'pos_order_item_modifiers','pos_payments','pos_refunds','pos_discounts',
    'pos_order_events','pos_kitchen_tickets','pos_settings',
    'pos_inventory_movements','inventory_recipes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "service_role_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ── POS staff read/write policies ─────────────────────────────────────────────

-- pos_orders: staff/admin/owner can read their tenant's orders
DROP POLICY IF EXISTS "staff_read_pos_orders" ON public.pos_orders;
CREATE POLICY "staff_read_pos_orders" ON public.pos_orders
  FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "staff_write_pos_orders" ON public.pos_orders;
CREATE POLICY "staff_write_pos_orders" ON public.pos_orders
  FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

-- Customers can see their own orders
DROP POLICY IF EXISTS "customer_read_pos_orders" ON public.pos_orders;
CREATE POLICY "customer_read_pos_orders" ON public.pos_orders
  FOR SELECT TO authenticated
  USING (
    customer_account_id IN (
      SELECT id FROM public.customer_accounts
      WHERE auth_user_id = auth.uid() AND tenant_id = pos_orders.tenant_id AND status = 'active'
    )
  );

-- Apply same tenant-based policy to all other POS tables
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_registers','pos_shifts','pos_order_items',
    'pos_modifier_groups','pos_modifiers','pos_product_modifier_groups',
    'pos_order_item_modifiers','pos_payments','pos_refunds','pos_discounts',
    'pos_order_events','pos_kitchen_tickets','pos_settings',
    'pos_inventory_movements','inventory_recipes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "staff_all_%s" ON public.%I FOR ALL TO authenticated USING (public.current_user_has_tenant_access(tenant_id)) WITH CHECK (public.current_user_has_tenant_access(tenant_id))',
      t, t
    );
  END LOOP;
END $$;

-- ── RPC: Generate order number atomically ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_generate_order_number(p_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prefix text;
  v_num    integer;
BEGIN
  UPDATE public.pos_settings
  SET next_order_number = next_order_number + 1
  WHERE tenant_id = p_tenant_id
  RETURNING order_number_prefix, next_order_number - 1
  INTO v_prefix, v_num;

  IF v_num IS NULL THEN
    RETURN 'POS-' || floor(extract(epoch from now()))::text;
  END IF;

  RETURN v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_generate_order_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_tenant_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(uuid, text[]) TO authenticated;

-- ── RPC: POS analytics ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pos_analytics(p_tenant_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_since           timestamptz := now() - (p_days || ' days')::interval;
  v_today_start     timestamptz := date_trunc('day', now());
  v_week_start      timestamptz := date_trunc('week', now());
  v_sales_today     bigint;
  v_sales_week      bigint;
  v_sales_month     bigint;
  v_order_count     bigint;
  v_avg_order       numeric;
  v_top_items       jsonb;
  v_payment_methods jsonb;
BEGIN
  SELECT COALESCE(SUM(total_cents), 0) INTO v_sales_today
  FROM public.pos_orders
  WHERE tenant_id = p_tenant_id AND payment_status = 'paid'
    AND created_at >= v_today_start;

  SELECT COALESCE(SUM(total_cents), 0) INTO v_sales_week
  FROM public.pos_orders
  WHERE tenant_id = p_tenant_id AND payment_status = 'paid'
    AND created_at >= v_week_start;

  SELECT COALESCE(SUM(total_cents), 0) INTO v_sales_month
  FROM public.pos_orders
  WHERE tenant_id = p_tenant_id AND payment_status = 'paid'
    AND created_at >= v_since;

  SELECT COUNT(*), COALESCE(AVG(total_cents), 0)
  INTO v_order_count, v_avg_order
  FROM public.pos_orders
  WHERE tenant_id = p_tenant_id AND payment_status = 'paid'
    AND created_at >= v_since;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_top_items
  FROM (
    SELECT oi.name, SUM(oi.quantity) AS total_qty, SUM(oi.total_cents) AS total_revenue
    FROM public.pos_order_items oi
    JOIN public.pos_orders o ON o.id = oi.order_id
    WHERE oi.tenant_id = p_tenant_id AND o.payment_status = 'paid'
      AND o.created_at >= v_since
    GROUP BY oi.name
    ORDER BY total_qty DESC LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_payment_methods
  FROM (
    SELECT payment_method, COUNT(*) AS count, SUM(amount_cents) AS total
    FROM public.pos_payments
    WHERE tenant_id = p_tenant_id AND status = 'paid'
      AND created_at >= v_since
    GROUP BY payment_method ORDER BY total DESC
  ) x;

  RETURN jsonb_build_object(
    'sales_today_cents',    v_sales_today,
    'sales_week_cents',     v_sales_week,
    'sales_month_cents',    v_sales_month,
    'order_count',          v_order_count,
    'avg_order_cents',      round(v_avg_order),
    'top_items',            v_top_items,
    'payment_methods',      v_payment_methods
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pos_analytics(uuid, integer) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE 'Migration 065: POS module tables created.';
END $$;
