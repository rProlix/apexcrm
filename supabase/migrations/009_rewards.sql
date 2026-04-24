-- supabase/migrations/009_rewards.sql
-- ApexCRM — Full Rewards / Loyalty Module
-- Adds rewards programs, balances, transactions, shop items, punch cards.
-- Extends products table with rewards configuration columns.
-- All tables are tenant-scoped. RLS enforces isolation.

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend products table with rewards configuration
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rewards_points_earned integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rewards_enabled       boolean  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rewards_multiplier    numeric  NOT NULL DEFAULT 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rewards Programs
-- Holds the top-level configuration for a tenant's rewards program.
-- earning_rules jsonb: { points_per_dollar, bonus_points_products, enabled }
-- punch_card_rules jsonb: array of punch card rule objects
-- settings jsonb: { points_enabled, punch_cards_enabled, shop_enabled, min_redemption_points }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rewards_programs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  description       text,
  status            text        NOT NULL DEFAULT 'active',
  earning_rules     jsonb       NOT NULL DEFAULT '{"points_per_dollar":10,"enabled":true,"bonus_points_products":[]}',
  punch_card_rules  jsonb       NOT NULL DEFAULT '[]',
  settings          jsonb       NOT NULL DEFAULT '{"points_enabled":true,"punch_cards_enabled":true,"shop_enabled":true,"min_redemption_points":100}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_programs_status_check CHECK (status IN ('active', 'paused', 'archived'))
);

CREATE INDEX IF NOT EXISTS rewards_programs_tenant_idx  ON public.rewards_programs(tenant_id);
CREATE INDEX IF NOT EXISTS rewards_programs_status_idx  ON public.rewards_programs(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rewards Balances
-- One row per customer per tenant. Updated atomically on every transaction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rewards_balances (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id               uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points_balance            integer     NOT NULL DEFAULT 0,
  lifetime_points_earned    integer     NOT NULL DEFAULT 0,
  lifetime_points_redeemed  integer     NOT NULL DEFAULT 0,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS rewards_balances_tenant_idx    ON public.rewards_balances(tenant_id);
CREATE INDEX IF NOT EXISTS rewards_balances_customer_idx  ON public.rewards_balances(customer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rewards Transactions
-- Immutable ledger of every points movement.
-- transaction_type: earned | redeemed | adjusted | expired | bonus
-- source_type:      order | product | manual | punch_card | reward_item | admin_adjustment
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rewards_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id      uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id       uuid        REFERENCES public.rewards_programs(id) ON DELETE SET NULL,
  transaction_type text        NOT NULL,
  points_delta     integer     NOT NULL,
  source_type      text,
  source_id        uuid,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_transactions_type_check CHECK (
    transaction_type IN ('earned', 'redeemed', 'adjusted', 'expired', 'bonus')
  )
);

CREATE INDEX IF NOT EXISTS rewards_transactions_tenant_idx    ON public.rewards_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS rewards_transactions_customer_idx  ON public.rewards_transactions(customer_id);
CREATE INDEX IF NOT EXISTS rewards_transactions_program_idx   ON public.rewards_transactions(program_id);
CREATE INDEX IF NOT EXISTS rewards_transactions_source_idx    ON public.rewards_transactions(source_id);
CREATE INDEX IF NOT EXISTS rewards_transactions_created_idx   ON public.rewards_transactions(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reward Shop Items
-- Items customers can redeem with points. May be linked to a store product.
-- redemption_type: discount | free_item | points_only | custom
-- discount_type:   percent | fixed_amount (null when not a discount)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_shop_items (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                          text        NOT NULL,
  description                   text,
  points_cost                   integer     NOT NULL CHECK (points_cost > 0),
  is_active                     boolean     NOT NULL DEFAULT true,
  image_url                     text,
  product_id                    uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  redemption_type               text        NOT NULL DEFAULT 'points_only',
  discount_type                 text,
  discount_value                numeric,
  inventory_count               integer     NOT NULL DEFAULT 0,
  max_redemptions_per_customer  integer,
  settings                      jsonb       NOT NULL DEFAULT '{}',
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_shop_items_redemption_type_check CHECK (
    redemption_type IN ('discount', 'free_item', 'points_only', 'custom')
  ),
  CONSTRAINT reward_shop_items_discount_type_check CHECK (
    discount_type IS NULL OR discount_type IN ('percent', 'fixed_amount')
  )
);

CREATE INDEX IF NOT EXISTS reward_shop_items_tenant_idx    ON public.reward_shop_items(tenant_id);
CREATE INDEX IF NOT EXISTS reward_shop_items_product_idx   ON public.reward_shop_items(product_id);
CREATE INDEX IF NOT EXISTS reward_shop_items_active_idx    ON public.reward_shop_items(is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reward Redemptions
-- Records every customer redemption of a shop item.
-- status: pending | approved | fulfilled | canceled
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id    uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reward_item_id uuid        REFERENCES public.reward_shop_items(id) ON DELETE SET NULL,
  points_used    integer     NOT NULL CHECK (points_used > 0),
  status         text        NOT NULL DEFAULT 'pending',
  metadata       jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_redemptions_status_check CHECK (
    status IN ('pending', 'approved', 'fulfilled', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS reward_redemptions_tenant_idx    ON public.reward_redemptions(tenant_id);
CREATE INDEX IF NOT EXISTS reward_redemptions_customer_idx  ON public.reward_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS reward_redemptions_status_idx    ON public.reward_redemptions(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reward Punch Cards
-- Tracks a customer's punch card progress for a specific product/rule.
-- reward_type: free_item | percent_off | fixed_off | bonus_points
-- status: active | completed | expired
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_punch_cards (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id      uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  punch_goal      integer     NOT NULL CHECK (punch_goal > 0),
  current_punches integer     NOT NULL DEFAULT 0,
  reward_type     text        NOT NULL,
  reward_value    numeric,
  status          text        NOT NULL DEFAULT 'active',
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_punch_cards_reward_type_check CHECK (
    reward_type IN ('free_item', 'percent_off', 'fixed_off', 'bonus_points')
  ),
  CONSTRAINT reward_punch_cards_status_check CHECK (
    status IN ('active', 'completed', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS reward_punch_cards_tenant_idx    ON public.reward_punch_cards(tenant_id);
CREATE INDEX IF NOT EXISTS reward_punch_cards_customer_idx  ON public.reward_punch_cards(customer_id);
CREATE INDEX IF NOT EXISTS reward_punch_cards_product_idx   ON public.reward_punch_cards(product_id);
CREATE INDEX IF NOT EXISTS reward_punch_cards_status_idx    ON public.reward_punch_cards(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reward Punch Card Events
-- Append-only log of every punch recorded on a punch card.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_punch_card_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  punch_card_id uuid        NOT NULL REFERENCES public.reward_punch_cards(id) ON DELETE CASCADE,
  customer_id   uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id      uuid,
  product_id    uuid,
  punches_added integer     NOT NULL DEFAULT 1,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_punch_card_events_tenant_idx      ON public.reward_punch_card_events(tenant_id);
CREATE INDEX IF NOT EXISTS reward_punch_card_events_punch_card_idx  ON public.reward_punch_card_events(punch_card_id);
CREATE INDEX IF NOT EXISTS reward_punch_card_events_customer_idx    ON public.reward_punch_card_events(customer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reward Program Events
-- Audit trail of admin actions on rewards programs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_program_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id  uuid        REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_program_events_tenant_idx   ON public.reward_program_events(tenant_id);
CREATE INDEX IF NOT EXISTS reward_program_events_program_idx  ON public.reward_program_events(program_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — enable on all new tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.rewards_programs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_shop_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_punch_cards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_punch_card_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_program_events    ENABLE ROW LEVEL SECURITY;

-- ── Service role full access (matches existing pattern) ──────────────────────
CREATE POLICY service_role_all ON public.rewards_programs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.rewards_balances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.rewards_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.reward_shop_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.reward_redemptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.reward_punch_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.reward_punch_card_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.reward_program_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── rewards_programs: owner sees all; admin sees own tenant ──────────────────
CREATE POLICY rewards_programs_owner ON public.rewards_programs
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY rewards_programs_admin ON public.rewards_programs
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ── rewards_balances: owner all; admin tenant; customer own ──────────────────
CREATE POLICY rewards_balances_owner ON public.rewards_balances
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY rewards_balances_admin ON public.rewards_balances
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY rewards_balances_customer_own ON public.rewards_balances
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'customer'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND customer_id IN (
      SELECT customer_id FROM public.customer_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- ── rewards_transactions: owner all; admin tenant; customer own ──────────────
CREATE POLICY rewards_transactions_owner ON public.rewards_transactions
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY rewards_transactions_admin ON public.rewards_transactions
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY rewards_transactions_customer_own ON public.rewards_transactions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'customer'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND customer_id IN (
      SELECT customer_id FROM public.customer_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- ── reward_shop_items: owner all; admin manage; customer read active ──────────
CREATE POLICY reward_shop_items_owner ON public.reward_shop_items
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY reward_shop_items_admin ON public.reward_shop_items
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY reward_shop_items_customer_read ON public.reward_shop_items
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── reward_redemptions: owner all; admin tenant; customer own ─────────────────
CREATE POLICY reward_redemptions_owner ON public.reward_redemptions
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY reward_redemptions_admin ON public.reward_redemptions
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY reward_redemptions_customer_own ON public.reward_redemptions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'customer'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND customer_id IN (
      SELECT customer_id FROM public.customer_accounts WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY reward_redemptions_customer_insert ON public.reward_redemptions
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'customer'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND customer_id IN (
      SELECT customer_id FROM public.customer_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- ── reward_punch_cards: owner all; admin tenant; customer own ─────────────────
CREATE POLICY reward_punch_cards_owner ON public.reward_punch_cards
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY reward_punch_cards_admin ON public.reward_punch_cards
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY reward_punch_cards_customer_own ON public.reward_punch_cards
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'customer'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND customer_id IN (
      SELECT customer_id FROM public.customer_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- ── reward_punch_card_events: mirrors punch card policies ─────────────────────
CREATE POLICY reward_punch_card_events_owner ON public.reward_punch_card_events
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY reward_punch_card_events_admin ON public.reward_punch_card_events
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY reward_punch_card_events_customer_own ON public.reward_punch_card_events
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'customer'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND customer_id IN (
      SELECT customer_id FROM public.customer_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- ── reward_program_events: owner + admin only ─────────────────────────────────
CREATE POLICY reward_program_events_owner ON public.reward_program_events
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY reward_program_events_admin ON public.reward_program_events
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed tenant_modules with rewards for existing active tenants
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled, config)
SELECT
  t.id,
  'rewards',
  true,
  '{"points_per_dollar":10}'::jsonb
FROM public.tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: atomically upsert rewards balance and return new balance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_rewards_balance(
  p_tenant_id   uuid,
  p_customer_id uuid,
  p_points_delta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  INSERT INTO public.rewards_balances (tenant_id, customer_id, points_balance, lifetime_points_earned, lifetime_points_redeemed)
  VALUES (
    p_tenant_id,
    p_customer_id,
    GREATEST(0, p_points_delta),
    CASE WHEN p_points_delta > 0 THEN p_points_delta ELSE 0 END,
    CASE WHEN p_points_delta < 0 THEN ABS(p_points_delta) ELSE 0 END
  )
  ON CONFLICT (tenant_id, customer_id) DO UPDATE
    SET
      points_balance           = GREATEST(0, rewards_balances.points_balance + p_points_delta),
      lifetime_points_earned   = rewards_balances.lifetime_points_earned   + CASE WHEN p_points_delta > 0 THEN p_points_delta ELSE 0 END,
      lifetime_points_redeemed = rewards_balances.lifetime_points_redeemed + CASE WHEN p_points_delta < 0 THEN ABS(p_points_delta) ELSE 0 END,
      updated_at               = now()
  RETURNING points_balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: increment punch card punches and mark completed when goal reached
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_punch_card(
  p_punch_card_id uuid,
  p_punches       integer DEFAULT 1
)
RETURNS TABLE(current_punches integer, status text, completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal    integer;
  v_current integer;
  v_status  text;
BEGIN
  UPDATE public.reward_punch_cards
  SET
    current_punches = LEAST(punch_goal, current_punches + p_punches),
    status          = CASE
                        WHEN (current_punches + p_punches) >= punch_goal THEN 'completed'
                        ELSE status
                      END,
    updated_at      = now()
  WHERE id = p_punch_card_id
    AND status = 'active'
  RETURNING punch_goal, reward_punch_cards.current_punches, reward_punch_cards.status
  INTO v_goal, v_current, v_status;

  RETURN QUERY SELECT v_current, v_status, (v_status = 'completed');
END;
$$;
