-- Production rewards and loyalty platform.
-- Evolves the existing Rewards module in place. tenant_id remains the only tenant key.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Program capabilities and presentation.
ALTER TABLE public.rewards_programs
  ADD COLUMN IF NOT EXISTS program_type text NOT NULL DEFAULT 'points',
  ADD COLUMN IF NOT EXISTS currency_display_name text NOT NULL DEFAULT 'Points',
  ADD COLUMN IF NOT EXISTS points_name text NOT NULL DEFAULT 'points',
  ADD COLUMN IF NOT EXISTS points_abbreviation text NOT NULL DEFAULT 'pts',
  ADD COLUMN IF NOT EXISTS earning_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS redemption_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wallet_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiration_policy jsonb NOT NULL DEFAULT '{"type":"never"}'::jsonb,
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.rewards_programs DROP CONSTRAINT IF EXISTS rewards_programs_status_check;
ALTER TABLE public.rewards_programs
  ADD CONSTRAINT rewards_programs_status_check
  CHECK (lower(status) IN ('draft', 'active', 'paused', 'archived'));
ALTER TABLE public.rewards_programs DROP CONSTRAINT IF EXISTS rewards_programs_program_type_check;
ALTER TABLE public.rewards_programs
  ADD CONSTRAINT rewards_programs_program_type_check
  CHECK (lower(program_type) IN ('points', 'punches', 'hybrid'));

-- One membership per tenant, customer, and program. Customer data stays in customers.
CREATE TABLE IF NOT EXISTS public.reward_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  membership_number text NOT NULL,
  referral_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  barcode_token_hash text NOT NULL,
  barcode_token_ciphertext text NOT NULL,
  wallet_enabled boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, program_id),
  UNIQUE (tenant_id, membership_number),
  UNIQUE (tenant_id, referral_code),
  UNIQUE (barcode_token_hash)
);
CREATE INDEX IF NOT EXISTS reward_memberships_customer_idx
  ON public.reward_memberships (tenant_id, customer_id, status);

-- Normalized earning rules replace opaque JSON for execution. Existing JSON remains readable.
CREATE TABLE IF NOT EXISTS public.reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'order_completed', 'payment_confirmed', 'appointment_completed', 'first_appointment',
    'birthday', 'referral_qualified', 'manual'
  )),
  earning_basis text NOT NULL DEFAULT 'fixed' CHECK (earning_basis IN (
    'fixed', 'spend', 'product', 'category', 'service', 'visit'
  )),
  amount_threshold numeric(12,2),
  points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  points_per_currency numeric(12,4),
  minimum_spend numeric(12,2),
  maximum_per_event integer,
  eligible_product_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_category_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_service_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_location_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_tier_ids uuid[] NOT NULL DEFAULT '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_rules_match_idx
  ON public.reward_rules (tenant_id, program_id, event_type, enabled);

-- Existing rewards_transactions remains the canonical immutable points ledger.
ALTER TABLE public.rewards_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS performed_by uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_transaction_id uuid REFERENCES public.rewards_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.rewards_transactions DROP CONSTRAINT IF EXISTS rewards_transactions_type_check;
ALTER TABLE public.rewards_transactions
  ADD CONSTRAINT rewards_transactions_type_check CHECK (transaction_type IN (
    'earned', 'redeemed', 'adjusted', 'expired', 'bonus',
    'refund_reversal', 'promotion', 'referral', 'birthday'
  ));
CREATE UNIQUE INDEX IF NOT EXISTS rewards_transactions_idempotency_idx
  ON public.rewards_transactions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS rewards_transactions_expiry_idx
  ON public.rewards_transactions (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- Punch definitions are tenant-owned templates; reward_punch_cards remains customer progress.
CREATE TABLE IF NOT EXISTS public.reward_punch_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  required_punches integer NOT NULL CHECK (required_punches > 0),
  reward_type text NOT NULL CHECK (reward_type IN ('free_item','percent_off','fixed_off','bonus_points','custom')),
  reward_value numeric,
  reward_item_id uuid REFERENCES public.reward_shop_items(id) ON DELETE SET NULL,
  eligible_product_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_category_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_service_ids uuid[] NOT NULL DEFAULT '{}',
  earning_method text NOT NULL DEFAULT 'purchase' CHECK (earning_method IN ('purchase','appointment','visit','manual')),
  repeatable boolean NOT NULL DEFAULT true,
  maximum_active_cards integer NOT NULL DEFAULT 1 CHECK (maximum_active_cards > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  expires_after_days integer,
  eligible_tier_ids uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_punch_definitions_match_idx
  ON public.reward_punch_definitions (tenant_id, program_id, earning_method, enabled);

ALTER TABLE public.reward_punch_cards
  ADD COLUMN IF NOT EXISTS definition_id uuid REFERENCES public.reward_punch_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.rewards_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.reward_punch_card_events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'earned',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS performed_by uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.reward_punch_card_events DROP CONSTRAINT IF EXISTS reward_punch_card_events_type_check;
ALTER TABLE public.reward_punch_card_events
  ADD CONSTRAINT reward_punch_card_events_type_check
  CHECK (event_type IN ('earned','redeemed','adjusted','expired','reversed'));
CREATE UNIQUE INDEX IF NOT EXISTS reward_punch_events_idempotency_idx
  ON public.reward_punch_card_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Reward catalog extensions and secure redemption credentials.
ALTER TABLE public.reward_shop_items
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reward_type text NOT NULL DEFAULT 'custom_reward',
  ADD COLUMN IF NOT EXISTS punch_requirement integer,
  ADD COLUMN IF NOT EXISTS total_inventory_limit integer,
  ADD COLUMN IF NOT EXISTS total_redemption_limit integer,
  ADD COLUMN IF NOT EXISTS eligible_product_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eligible_service_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eligible_tier_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.reward_shop_items DROP CONSTRAINT IF EXISTS reward_shop_items_reward_type_check;
ALTER TABLE public.reward_shop_items
  ADD CONSTRAINT reward_shop_items_reward_type_check CHECK (reward_type IN (
    'free_product','product_discount','order_discount','free_service','service_discount',
    'fixed_value','percentage','custom_reward'
  ));

ALTER TABLE public.reward_redemptions
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.rewards_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.reward_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credential_hash text,
  ADD COLUMN IF NOT EXISTS credential_last_four text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS redeemed_by uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.reward_redemptions DROP CONSTRAINT IF EXISTS reward_redemptions_status_check;
UPDATE public.reward_redemptions SET status = CASE status
  WHEN 'pending' THEN 'available' WHEN 'approved' THEN 'claimed'
  WHEN 'fulfilled' THEN 'redeemed' WHEN 'canceled' THEN 'cancelled' ELSE status END;
ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_status_check
  CHECK (status IN ('available','claimed','redeemed','expired','cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS reward_redemptions_credential_idx
  ON public.reward_redemptions (credential_hash) WHERE credential_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reward_redemptions_idempotency_idx
  ON public.reward_redemptions (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reward_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 0),
  qualification_type text NOT NULL CHECK (qualification_type IN ('points','spend','visits','purchases','appointments')),
  threshold numeric(14,2) NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  qualification_window text NOT NULL DEFAULT 'lifetime' CHECK (qualification_window IN ('lifetime','rolling_12_months')),
  points_multiplier numeric(6,2) NOT NULL DEFAULT 1 CHECK (points_multiplier >= 0),
  benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
  color text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, rank),
  UNIQUE (program_id, name)
);

CREATE TABLE IF NOT EXISTS public.reward_customer_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.reward_tiers(id) ON DELETE RESTRICT,
  qualification_value numeric(14,2) NOT NULL DEFAULT 0,
  is_manual_override boolean NOT NULL DEFAULT false,
  override_reason text,
  performed_by uuid,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, program_id)
);

CREATE TABLE IF NOT EXISTS public.reward_tier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  previous_tier_id uuid REFERENCES public.reward_tiers(id) ON DELETE SET NULL,
  tier_id uuid REFERENCES public.reward_tiers(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('qualified','upgraded','downgraded','manual_override','override_removed')),
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reward_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended','archived')),
  rule_type text NOT NULL CHECK (rule_type IN ('multiplier','bonus_points','bonus_punch','spend_bonus','visit_bonus')),
  multiplier numeric(6,2),
  bonus_points integer,
  bonus_punches integer,
  minimum_spend numeric(12,2),
  eligible_tier_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_product_ids uuid[] NOT NULL DEFAULT '{}',
  eligible_service_ids uuid[] NOT NULL DEFAULT '{}',
  budget_limit integer,
  issued_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.reward_referral_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  qualification_type text NOT NULL DEFAULT 'first_purchase' CHECK (qualification_type IN ('signup','first_purchase','first_appointment')),
  referrer_points integer NOT NULL DEFAULT 0 CHECK (referrer_points >= 0),
  referred_points integer NOT NULL DEFAULT 0 CHECK (referred_points >= 0),
  terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, program_id)
);

CREATE TABLE IF NOT EXISTS public.reward_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referral_program_id uuid NOT NULL REFERENCES public.reward_referral_programs(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referred_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rewarded','rejected')),
  qualification_source_type text,
  qualification_source_id uuid,
  rejection_reason text,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, referral_code),
  CHECK (referred_customer_id IS NULL OR referred_customer_id <> referrer_customer_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_referrals_referred_once_idx
  ON public.reward_referrals (tenant_id, referral_program_id, referred_customer_id)
  WHERE referred_customer_id IS NOT NULL;

-- Provider-neutral Wallet state and Apple device registrations.
CREATE TABLE IF NOT EXISTS public.wallet_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.rewards_programs(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.reward_memberships(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'apple' CHECK (provider IN ('apple','google')),
  serial_number text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided','suspended')),
  authentication_token_hash text NOT NULL,
  authentication_token_ciphertext text NOT NULL,
  last_updated_tag bigint NOT NULL DEFAULT 1,
  last_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, serial_number),
  UNIQUE (membership_id, provider)
);

CREATE TABLE IF NOT EXISTS public.wallet_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_library_identifier_hash text NOT NULL UNIQUE,
  push_token_ciphertext text NOT NULL,
  push_token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_pass_registrations (
  device_id uuid NOT NULL REFERENCES public.wallet_devices(id) ON DELETE CASCADE,
  wallet_pass_id uuid NOT NULL REFERENCES public.wallet_passes(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, wallet_pass_id)
);

CREATE TABLE IF NOT EXISTS public.wallet_update_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_pass_id uuid NOT NULL REFERENCES public.wallet_passes(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT (now() + interval '5 seconds'),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_update_jobs_coalesce_idx
  ON public.wallet_update_jobs (wallet_pass_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.reward_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.rewards_programs(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  source_type text,
  source_id uuid,
  revenue_amount numeric(12,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_analytics_tenant_time_idx
  ON public.reward_analytics_events (tenant_id, created_at DESC, event_name);
CREATE UNIQUE INDEX IF NOT EXISTS reward_analytics_events_source_once_idx
  ON public.reward_analytics_events (tenant_id, event_name, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- All new tenant data is RLS protected. Wallet protocol tables are server-only.
ALTER TABLE public.reward_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_punch_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_customer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_tier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_referral_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pass_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_update_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_analytics_events ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reward_memberships','reward_rules','reward_punch_definitions','reward_tiers',
    'reward_customer_tiers','reward_tier_events','reward_promotions',
    'reward_referral_programs','reward_referrals','wallet_passes','wallet_devices',
    'wallet_pass_registrations','wallet_update_jobs','reward_analytics_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_service_role', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name || '_service_role', table_name
    );
  END LOOP;
END;
$policies$;

-- Tenant administrators may manage tenant-facing configuration and data.
DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reward_memberships','reward_rules','reward_punch_definitions','reward_tiers',
    'reward_customer_tiers','reward_tier_events','reward_promotions',
    'reward_referral_programs','reward_referrals','reward_analytics_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_admin', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_tenant_admin_or_owner(tenant_id)) WITH CHECK (public.is_tenant_admin_or_owner(tenant_id))',
      table_name || '_tenant_admin', table_name
    );
  END LOOP;
END;
$policies$;

-- Customers can read only their own tenant membership/tier/referral data.
CREATE POLICY reward_memberships_customer_read ON public.reward_memberships FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND customer_id = public.current_customer_id());
CREATE POLICY reward_customer_tiers_customer_read ON public.reward_customer_tiers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND customer_id = public.current_customer_id());
CREATE POLICY reward_tier_events_customer_read ON public.reward_tier_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND customer_id = public.current_customer_id());
CREATE POLICY reward_referrals_customer_read ON public.reward_referrals FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (referrer_customer_id = public.current_customer_id() OR referred_customer_id = public.current_customer_id())
  );
CREATE POLICY reward_tiers_customer_read ON public.reward_tiers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND enabled = true);
CREATE POLICY reward_promotions_customer_read ON public.reward_promotions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND status = 'active' AND now() BETWEEN starts_at AND ends_at);

-- Prevent mutation of ledger history. Corrections are new adjustment/reversal rows.
CREATE OR REPLACE FUNCTION public.prevent_reward_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Reward ledger entries are immutable; create an adjustment or reversal';
END;
$$;
DROP TRIGGER IF EXISTS rewards_transactions_immutable ON public.rewards_transactions;
CREATE TRIGGER rewards_transactions_immutable
  BEFORE UPDATE OR DELETE ON public.rewards_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_reward_ledger_mutation();

-- Atomic, idempotent point mutation. Service callers must still provide tenant scope.
CREATE OR REPLACE FUNCTION public.apply_reward_points(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_program_id uuid,
  p_transaction_type text,
  p_points_delta integer,
  p_source_type text,
  p_source_id uuid,
  p_idempotency_key text,
  p_description text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL,
  p_reversed_transaction_id uuid DEFAULT NULL
)
RETURNS TABLE(transaction_id uuid, points_balance integer, was_applied boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE existing_tx uuid; existing_balance integer; new_tx uuid;
BEGIN
  IF p_points_delta = 0 THEN RAISE EXCEPTION 'points_delta must not be zero'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'A stable idempotency key is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Customer does not belong to tenant';
  END IF;
  IF p_program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rewards_programs WHERE id = p_program_id AND tenant_id = p_tenant_id
  ) THEN RAISE EXCEPTION 'Program does not belong to tenant'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_customer_id::text, 0));
  SELECT id INTO existing_tx FROM rewards_transactions
   WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  IF existing_tx IS NOT NULL THEN
    SELECT coalesce(rb.points_balance, 0) INTO existing_balance FROM rewards_balances rb
     WHERE rb.tenant_id = p_tenant_id AND rb.customer_id = p_customer_id;
    RETURN QUERY SELECT existing_tx, coalesce(existing_balance, 0), false;
    RETURN;
  END IF;

  SELECT coalesce(rb.points_balance, 0) INTO existing_balance FROM rewards_balances rb
   WHERE rb.tenant_id = p_tenant_id AND rb.customer_id = p_customer_id FOR UPDATE;
  IF p_points_delta < 0 AND coalesce(existing_balance, 0) + p_points_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient reward points';
  END IF;

  INSERT INTO rewards_transactions (
    tenant_id, customer_id, program_id, transaction_type, points_delta, source_type,
    source_id, idempotency_key, description, performed_by, metadata, expires_at, reversed_transaction_id
  ) VALUES (
    p_tenant_id, p_customer_id, p_program_id, p_transaction_type, p_points_delta, p_source_type,
    p_source_id, p_idempotency_key, p_description, p_performed_by, coalesce(p_metadata, '{}'::jsonb),
    p_expires_at, p_reversed_transaction_id
  ) RETURNING id INTO new_tx;

  INSERT INTO rewards_balances (
    tenant_id, customer_id, points_balance, lifetime_points_earned, lifetime_points_redeemed
  ) VALUES (
    p_tenant_id, p_customer_id, p_points_delta,
    CASE WHEN p_points_delta > 0 THEN p_points_delta ELSE 0 END,
    CASE WHEN p_transaction_type = 'redeemed' THEN abs(p_points_delta) ELSE 0 END
  ) ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
    points_balance = rewards_balances.points_balance + p_points_delta,
    lifetime_points_earned = rewards_balances.lifetime_points_earned +
      CASE WHEN p_points_delta > 0 THEN p_points_delta ELSE 0 END,
    lifetime_points_redeemed = rewards_balances.lifetime_points_redeemed +
      CASE WHEN p_transaction_type = 'redeemed' THEN abs(p_points_delta) ELSE 0 END,
    updated_at = now()
  RETURNING rewards_balances.points_balance INTO existing_balance;

  UPDATE wallet_passes SET last_updated_tag = last_updated_tag + 1, updated_at = now()
   WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id AND status = 'active';
  INSERT INTO wallet_update_jobs (tenant_id, wallet_pass_id, reason)
    SELECT p_tenant_id, wp.id, p_transaction_type FROM wallet_passes wp
     WHERE wp.tenant_id = p_tenant_id AND wp.customer_id = p_customer_id AND wp.status = 'active'
    ON CONFLICT (wallet_pass_id) WHERE status = 'pending'
    DO UPDATE SET reason = excluded.reason, available_at = now() + interval '5 seconds', updated_at = now();
  INSERT INTO reward_analytics_events (tenant_id, customer_id, program_id, event_name, source_type, source_id, metadata)
    VALUES (p_tenant_id, p_customer_id, p_program_id,
      CASE p_transaction_type WHEN 'redeemed' THEN 'points_redeemed' ELSE 'points_earned' END,
      p_source_type, p_source_id, jsonb_build_object('points_delta', p_points_delta));
  RETURN QUERY SELECT new_tx, existing_balance, true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_reward_points(uuid,uuid,uuid,text,integer,text,uuid,text,text,uuid,jsonb,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reward_points(uuid,uuid,uuid,text,integer,text,uuid,text,text,uuid,jsonb,timestamptz,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_reward_punch(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_definition_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_idempotency_key text,
  p_punches integer DEFAULT 1,
  p_performed_by uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(punch_card_id uuid, current_punches integer, completed boolean, was_applied boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE def reward_punch_definitions%ROWTYPE; card reward_punch_cards%ROWTYPE; existing_event uuid; new_current integer;
BEGIN
  IF p_punches = 0 THEN RAISE EXCEPTION 'punches must not be zero'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'A stable idempotency key is required';
  END IF;
  SELECT * INTO def FROM reward_punch_definitions
   WHERE id = p_definition_id AND tenant_id = p_tenant_id AND enabled = true
     AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch definition is unavailable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Customer does not belong to tenant';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_customer_id::text || ':' || p_definition_id::text, 0));
  SELECT id INTO existing_event FROM reward_punch_card_events
   WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  IF existing_event IS NOT NULL THEN
    SELECT * INTO card FROM reward_punch_cards WHERE id = (
      SELECT event.punch_card_id FROM reward_punch_card_events event WHERE event.id = existing_event
    );
    RETURN QUERY SELECT card.id, card.current_punches, card.status = 'completed', false;
    RETURN;
  END IF;
  SELECT * INTO card FROM reward_punch_cards
   WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
     AND definition_id = p_definition_id AND status = 'active'
   ORDER BY cycle DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO reward_punch_cards (
      tenant_id, customer_id, program_id, definition_id, title, punch_goal,
      current_punches, reward_type, reward_value, status, cycle, expires_at
    ) VALUES (
      p_tenant_id, p_customer_id, def.program_id, def.id, def.name, def.required_punches,
      0, CASE WHEN def.reward_type = 'custom' THEN 'bonus_points' ELSE def.reward_type END,
      def.reward_value, 'active', coalesce((SELECT max(cycle) + 1 FROM reward_punch_cards
        WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id AND definition_id = def.id), 1),
      CASE WHEN def.expires_after_days IS NULL THEN def.ends_at
        ELSE least(coalesce(def.ends_at, 'infinity'::timestamptz), now() + make_interval(days => def.expires_after_days)) END
    ) RETURNING * INTO card;
  END IF;
  IF card.expires_at IS NOT NULL AND card.expires_at <= now() THEN RAISE EXCEPTION 'Punch card has expired'; END IF;
  new_current := greatest(0, least(card.punch_goal, card.current_punches + p_punches));
  UPDATE reward_punch_cards SET current_punches = new_current,
    status = CASE WHEN new_current >= punch_goal THEN 'completed' ELSE 'active' END,
    updated_at = now() WHERE id = card.id;
  INSERT INTO reward_punch_card_events (
    tenant_id, punch_card_id, customer_id, punches_added, event_type, source_type,
    source_id, performed_by, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, card.id, p_customer_id, p_punches,
    CASE WHEN p_punches > 0 THEN 'earned' ELSE 'adjusted' END,
    p_source_type, p_source_id, p_performed_by, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  );
  UPDATE wallet_passes SET last_updated_tag = last_updated_tag + 1, updated_at = now()
   WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id AND status = 'active';
  INSERT INTO wallet_update_jobs (tenant_id, wallet_pass_id, reason)
    SELECT p_tenant_id, wp.id, 'punch_earned' FROM wallet_passes wp
     WHERE wp.tenant_id = p_tenant_id AND wp.customer_id = p_customer_id AND wp.status = 'active'
    ON CONFLICT (wallet_pass_id) WHERE status = 'pending'
    DO UPDATE SET reason = excluded.reason, available_at = now() + interval '5 seconds', updated_at = now();
  INSERT INTO reward_analytics_events (tenant_id, customer_id, program_id, event_name, source_type, source_id, metadata)
    VALUES (p_tenant_id, p_customer_id, def.program_id,
      CASE WHEN new_current >= card.punch_goal THEN 'punch_completed' ELSE 'punch_earned' END,
      p_source_type, p_source_id, jsonb_build_object('punches', p_punches, 'definition_id', def.id));
  RETURN QUERY SELECT card.id, new_current, new_current >= card.punch_goal, true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_reward_punch(uuid,uuid,uuid,text,uuid,text,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reward_punch(uuid,uuid,uuid,text,uuid,text,integer,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_reward_catalog_item(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_item_id uuid,
  p_program_id uuid,
  p_credential_hash text,
  p_credential_last_four text,
  p_idempotency_key text
)
RETURNS TABLE(redemption_id uuid, points_balance integer, was_applied boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE item reward_shop_items%ROWTYPE; existing reward_redemptions%ROWTYPE; balance integer; tx_result record; new_id uuid; product_inventory integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_customer_id::text || ':redeem', 0));
  SELECT * INTO existing FROM reward_redemptions
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT coalesce(rb.points_balance, 0) INTO balance FROM rewards_balances rb
      WHERE rb.tenant_id = p_tenant_id AND rb.customer_id = p_customer_id;
    RETURN QUERY SELECT existing.id, coalesce(balance, 0), false;
    RETURN;
  END IF;
  SELECT * INTO item FROM reward_shop_items WHERE id = p_item_id AND tenant_id = p_tenant_id
    AND is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward is unavailable'; END IF;
  IF item.program_id IS NOT NULL AND item.program_id <> p_program_id THEN RAISE EXCEPTION 'Reward does not belong to program'; END IF;
  IF item.inventory_count = 0 OR (item.total_inventory_limit IS NOT NULL AND item.inventory_count <= 0) THEN
    RAISE EXCEPTION 'Reward is out of stock';
  END IF;
  IF item.product_id IS NOT NULL THEN
    SELECT inventory_count INTO product_inventory FROM products
      WHERE id = item.product_id AND tenant_id = p_tenant_id AND is_active = true FOR UPDATE;
    IF NOT FOUND OR product_inventory <= 0 THEN RAISE EXCEPTION 'Linked product is out of stock'; END IF;
  END IF;
  IF item.total_redemption_limit IS NOT NULL AND (
    SELECT count(*) FROM reward_redemptions WHERE tenant_id = p_tenant_id AND reward_item_id = p_item_id AND status <> 'cancelled'
  ) >= item.total_redemption_limit THEN RAISE EXCEPTION 'Reward redemption limit reached'; END IF;
  IF item.max_redemptions_per_customer IS NOT NULL AND (
    SELECT count(*) FROM reward_redemptions WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
      AND reward_item_id = p_item_id AND status <> 'cancelled'
  ) >= item.max_redemptions_per_customer THEN RAISE EXCEPTION 'Customer redemption limit reached'; END IF;

  SELECT * INTO tx_result FROM apply_reward_points(
    p_tenant_id, p_customer_id, p_program_id, 'redeemed', -item.points_cost,
    'reward_item', p_item_id, p_idempotency_key || ':points', 'Redeemed ' || item.name,
    NULL, jsonb_build_object('item_name', item.name), NULL, NULL
  );
  INSERT INTO reward_redemptions (
    tenant_id, customer_id, reward_item_id, program_id, points_used, status,
    credential_hash, credential_last_four, expires_at, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, p_customer_id, p_item_id, p_program_id, item.points_cost, 'available',
    p_credential_hash, p_credential_last_four, least(coalesce(item.ends_at, 'infinity'::timestamptz), now() + interval '30 days'),
    p_idempotency_key, jsonb_build_object('item_name', item.name, 'redemption_type', item.redemption_type)
  ) RETURNING id INTO new_id;
  IF item.inventory_count > 0 THEN UPDATE reward_shop_items SET inventory_count = inventory_count - 1 WHERE id = item.id; END IF;
  IF item.product_id IS NOT NULL THEN UPDATE products SET inventory_count = inventory_count - 1 WHERE id = item.product_id; END IF;
  INSERT INTO reward_analytics_events (tenant_id, customer_id, program_id, event_name, source_type, source_id)
    VALUES (p_tenant_id, p_customer_id, p_program_id, 'reward_claimed', 'reward_item', item.id);
  RETURN QUERY SELECT new_id, tx_result.points_balance, true;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_reward_catalog_item(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward_catalog_item(uuid,uuid,uuid,uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_reward_redemption(
  p_tenant_id uuid, p_redemption_id uuid, p_actor_id uuid, p_idempotency_key text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  UPDATE reward_redemptions SET status = 'redeemed', redeemed_at = now(), redeemed_by = p_actor_id, updated_at = now(),
    metadata = metadata || jsonb_build_object('completion_idempotency_key', p_idempotency_key)
  WHERE id = p_redemption_id AND tenant_id = p_tenant_id AND status IN ('available','claimed')
    AND (expires_at IS NULL OR expires_at > now())
    AND NOT (metadata ? 'completion_idempotency_key');
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed > 0 THEN
    INSERT INTO reward_analytics_events (tenant_id, customer_id, program_id, event_name, source_type, source_id)
      SELECT tenant_id, customer_id, program_id, 'reward_redeemed', 'redemption', id
      FROM reward_redemptions WHERE id = p_redemption_id;
  END IF;
  RETURN changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_reward_redemption(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_reward_redemption(uuid,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_reward_redemption(
  p_tenant_id uuid, p_redemption_id uuid, p_actor_id uuid, p_idempotency_key text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE redemption reward_redemptions%ROWTYPE; item reward_shop_items%ROWTYPE;
BEGIN
  SELECT * INTO redemption FROM reward_redemptions
    WHERE id = p_redemption_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR redemption.status NOT IN ('available', 'claimed') THEN RETURN false; END IF;
  IF redemption.points_used > 0 THEN
    PERFORM * FROM apply_reward_points(
      p_tenant_id, redemption.customer_id, redemption.program_id, 'adjusted', redemption.points_used,
      'redemption_cancelled', redemption.id, p_idempotency_key || ':points', 'Cancelled redemption refund',
      p_actor_id, '{}'::jsonb, NULL, NULL
    );
  END IF;
  SELECT * INTO item FROM reward_shop_items WHERE id = redemption.reward_item_id FOR UPDATE;
  IF FOUND THEN
    IF item.inventory_count >= 0 THEN
      UPDATE reward_shop_items SET inventory_count = inventory_count + 1, updated_at = now() WHERE id = item.id;
    END IF;
    IF item.product_id IS NOT NULL THEN
      UPDATE products SET inventory_count = inventory_count + 1
        WHERE id = item.product_id AND tenant_id = p_tenant_id;
    END IF;
  END IF;
  UPDATE reward_redemptions SET status = 'cancelled', updated_at = now(),
    metadata = metadata || jsonb_build_object('cancelled_by', p_actor_id, 'cancel_idempotency_key', p_idempotency_key)
    WHERE id = redemption.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_reward_redemption(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reward_redemption(uuid,uuid,uuid,text) TO service_role;

-- Backfill memberships without inventing secrets. Application lazily provisions secure tokens.
INSERT INTO public.reward_memberships (
  tenant_id, customer_id, program_id, membership_number, barcode_token_hash, barcode_token_ciphertext
)
SELECT rb.tenant_id, rb.customer_id, rp.id,
  'RW-' || upper(substr(replace(rb.customer_id::text, '-', ''), 1, 10)),
  encode(digest('legacy:' || rb.tenant_id::text || ':' || rb.customer_id::text || ':' || rp.id::text, 'sha256'), 'hex'),
  'pending-rotation'
FROM public.rewards_balances rb
JOIN LATERAL (
  SELECT id FROM public.rewards_programs p
  WHERE p.tenant_id = rb.tenant_id ORDER BY (lower(p.status) = 'active') DESC, p.created_at LIMIT 1
) rp ON true
ON CONFLICT (tenant_id, customer_id, program_id) DO NOTHING;

COMMENT ON TABLE public.rewards_transactions IS 'Immutable canonical points ledger. Balance is a transactional cache derived from this ledger.';
COMMENT ON TABLE public.wallet_devices IS 'Server-only Apple Wallet device records. Identifiers and push tokens are never stored in plaintext.';
COMMENT ON COLUMN public.wallet_passes.authentication_token_ciphertext IS 'AES-GCM encrypted server-only token used inside signed Wallet passes.';
