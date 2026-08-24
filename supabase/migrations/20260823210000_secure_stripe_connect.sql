-- Secure the canonical multi-tenant Stripe Connect lifecycle.
-- Forward-only and compatible with the existing payment_accounts architecture.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.payment_oauth_states
  ADD COLUMN IF NOT EXISTS state_hash text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS return_path text NOT NULL DEFAULT '/payments/providers',
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

UPDATE public.payment_oauth_states
SET state_hash = encode(digest(state, 'sha256'), 'hex')
WHERE state_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_oauth_states_state_hash_uidx
  ON public.payment_oauth_states (state_hash)
  WHERE state_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_oauth_states_active_idx
  ON public.payment_oauth_states (provider, user_id, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS livemode boolean,
  ADD COLUMN IF NOT EXISTS charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connected_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS payment_accounts_stripe_account_uidx
  ON public.payment_accounts (provider_account_id)
  WHERE provider_key = 'stripe' AND provider_account_id IS NOT NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS provider_account_id text;
CREATE INDEX IF NOT EXISTS payment_transactions_provider_account_idx
  ON public.payment_transactions (tenant_id, provider_key, provider_account_id);

ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS provider_account_id text;
CREATE INDEX IF NOT EXISTS payment_links_provider_account_idx
  ON public.payment_links (tenant_id, provider_key, provider_account_id);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('stripe', 'square')),
  provider_event_id text NOT NULL,
  connected_account_id text,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  livemode boolean,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_code text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_tenant_status_idx
  ON public.payment_webhook_events (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_webhook_events_account_idx
  ON public.payment_webhook_events (provider, connected_account_id, created_at DESC);

ALTER TABLE public.payment_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_webhook_events'
      AND policyname = 'service_role_payment_webhook_events'
  ) THEN
    CREATE POLICY service_role_payment_webhook_events
      ON public.payment_webhook_events
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.consume_payment_oauth_state(
  p_state_hash text,
  p_provider text,
  p_user_id uuid
)
RETURNS TABLE (tenant_id uuid, user_id uuid, return_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.payment_oauth_states state_row
  SET consumed_at = now(), used = true
  WHERE state_row.state_hash = p_state_hash
    AND state_row.provider = p_provider
    AND state_row.user_id = p_user_id
    AND state_row.consumed_at IS NULL
    AND state_row.used = false
    AND state_row.expires_at > now()
  RETURNING state_row.tenant_id, state_row.user_id, state_row.return_path;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_payment_oauth_state(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_payment_oauth_state(text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.consume_payment_oauth_state(text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_payment_oauth_state(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.connect_stripe_account(
  p_tenant_id uuid,
  p_user_id uuid,
  p_account_id text,
  p_livemode boolean,
  p_status text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_details_submitted boolean,
  p_scope text,
  p_metadata jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicting_tenant uuid;
BEGIN
  IF p_account_id !~ '^acct_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid_stripe_account';
  END IF;

  SELECT tenant_id INTO conflicting_tenant
  FROM public.payment_accounts
  WHERE provider_key = 'stripe'
    AND provider_account_id = p_account_id
    AND tenant_id <> p_tenant_id
  FOR UPDATE;

  IF conflicting_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'stripe_account_conflict';
  END IF;

  INSERT INTO public.payment_accounts (
    tenant_id, provider_key, provider_account_id, access_token, refresh_token,
    scope, status, connection_method, livemode, charges_enabled, payouts_enabled,
    details_submitted, connected_by_user_id, connected_at, disconnected_at,
    last_verified_at, metadata, updated_at
  ) VALUES (
    p_tenant_id, 'stripe', p_account_id, NULL, NULL,
    COALESCE(p_scope, 'read_write'), p_status, 'oauth', p_livemode,
    p_charges_enabled, p_payouts_enabled, p_details_submitted, p_user_id,
    now(), NULL, now(), COALESCE(p_metadata, '{}'::jsonb), now()
  )
  ON CONFLICT (tenant_id, provider_key) DO UPDATE SET
    provider_account_id = EXCLUDED.provider_account_id,
    access_token = NULL,
    refresh_token = NULL,
    scope = EXCLUDED.scope,
    status = EXCLUDED.status,
    connection_method = 'oauth',
    livemode = EXCLUDED.livemode,
    charges_enabled = EXCLUDED.charges_enabled,
    payouts_enabled = EXCLUDED.payouts_enabled,
    details_submitted = EXCLUDED.details_submitted,
    connected_by_user_id = EXCLUDED.connected_by_user_id,
    connected_at = now(),
    disconnected_at = NULL,
    last_verified_at = now(),
    metadata = EXCLUDED.metadata,
    updated_at = now();

  INSERT INTO public.payment_providers (
    tenant_id, provider_key, is_enabled, config, updated_at
  ) VALUES (
    p_tenant_id, 'stripe', true, '{"connectionMethod":"oauth"}'::jsonb, now()
  )
  ON CONFLICT (tenant_id, provider_key) DO UPDATE SET
    is_enabled = true,
    config = '{"connectionMethod":"oauth"}'::jsonb,
    updated_at = now();

  RETURN p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_stripe_account(
  uuid, uuid, text, boolean, text, boolean, boolean, boolean, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connect_stripe_account(
  uuid, uuid, text, boolean, text, boolean, boolean, boolean, text, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.connect_stripe_account(
  uuid, uuid, text, boolean, text, boolean, boolean, boolean, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.connect_stripe_account(
  uuid, uuid, text, boolean, text, boolean, boolean, boolean, text, jsonb
) TO service_role;

COMMENT ON COLUMN public.payment_accounts.access_token IS
  'Legacy server-only OAuth token. New Stripe connections use the platform key plus connected account ID.';
COMMENT ON COLUMN public.payment_accounts.refresh_token IS
  'Legacy server-only OAuth refresh token. Never return through browser-facing queries.';
COMMENT ON TABLE public.payment_webhook_events IS
  'Minimal Stripe and Square webhook processing ledger. Payload bodies are intentionally not retained.';
