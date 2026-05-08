-- supabase/migrations/050_customer_invites.sql
-- Customer Invite System: secure token-based invite flow for customer portal onboarding.
-- All statements are idempotent (IF NOT EXISTS / DROP … IF EXISTS / DO $$ patterns).

-- ── 1. customer_invites table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_invites (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  customer_id   uuid                    REFERENCES public.customers(id) ON DELETE SET NULL,
  email         text        NOT NULL,
  full_name     text,
  phone         text,
  invited_by    uuid,
  role          text        NOT NULL DEFAULT 'customer',
  status        text        NOT NULL DEFAULT 'pending',
  token_hash    text        NOT NULL UNIQUE,
  invite_url    text,
  expires_at    timestamptz NOT NULL,
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  last_sent_at  timestamptz,
  resend_count  integer     NOT NULL DEFAULT 0,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Constraints (idempotent via DO$$)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_invites'::regclass AND conname = 'customer_invites_status_check'
  ) THEN
    ALTER TABLE public.customer_invites
      ADD CONSTRAINT customer_invites_status_check
        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_invites'::regclass AND conname = 'customer_invites_role_check'
  ) THEN
    ALTER TABLE public.customer_invites
      ADD CONSTRAINT customer_invites_role_check
        CHECK (role IN ('customer', 'member'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS customer_invites_tenant_idx
  ON public.customer_invites (tenant_id);

CREATE INDEX IF NOT EXISTS customer_invites_email_idx
  ON public.customer_invites (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS customer_invites_status_idx
  ON public.customer_invites (status);

CREATE INDEX IF NOT EXISTS customer_invites_expires_idx
  ON public.customer_invites (expires_at);

CREATE INDEX IF NOT EXISTS customer_invites_customer_idx
  ON public.customer_invites (customer_id)
  WHERE customer_id IS NOT NULL;

-- Unique pending invite per tenant/email
CREATE UNIQUE INDEX IF NOT EXISTS customer_invites_pending_unique_idx
  ON public.customer_invites (tenant_id, lower(email))
  WHERE status = 'pending';

-- ── 2. updated_at trigger for customer_invites ────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_customer_invites_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_invites_updated_at ON public.customer_invites;
CREATE TRIGGER trg_customer_invites_updated_at
  BEFORE UPDATE ON public.customer_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_invites_updated_at();

-- ── 3. Add invite_id to customer_accounts ────────────────────────────────────

ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS invite_id uuid REFERENCES public.customer_invites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_accounts_invite_idx
  ON public.customer_accounts (invite_id)
  WHERE invite_id IS NOT NULL;

-- ── 4. RLS on customer_invites ────────────────────────────────────────────────

ALTER TABLE public.customer_invites ENABLE ROW LEVEL SECURITY;

-- service_role: full access (used by all server-side API operations)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_invites' AND policyname = 'service_role_all_customer_invites'
  ) THEN
    CREATE POLICY "service_role_all_customer_invites"
      ON public.customer_invites FOR ALL
      TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Platform owner: full access across all tenants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_invites' AND policyname = 'owner_all_customer_invites'
  ) THEN
    CREATE POLICY "owner_all_customer_invites"
      ON public.customer_invites FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role = 'owner'
            AND u.status = 'active'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role = 'owner'
            AND u.status = 'active'
        )
      );
  END IF;
END $$;

-- Admin/staff: manage invites for their own tenant only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_invites' AND policyname = 'admin_tenant_customer_invites'
  ) THEN
    CREATE POLICY "admin_tenant_customer_invites"
      ON public.customer_invites FOR ALL
      TO authenticated
      USING (
        tenant_id = (
          SELECT u.tenant_id FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'staff')
            AND u.status = 'active'
          LIMIT 1
        )
      )
      WITH CHECK (
        tenant_id = (
          SELECT u.tenant_id FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'staff')
            AND u.status = 'active'
          LIMIT 1
        )
      );
  END IF;
END $$;

-- Customers: cannot list invites — token validation is server/service-role only
-- (No authenticated customer SELECT policy — customers have no visibility)

-- ── 5. RLS on appointments — add customer self-access ────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'customer_own_appointments'
  ) THEN
    CREATE POLICY "customer_own_appointments"
      ON public.appointments FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.customer_id  = appointments.customer_id
            AND ca.tenant_id    = appointments.tenant_id
            AND ca.status       = 'active'
        )
      );
  END IF;
END $$;

-- ── 6. RLS on rewards tables — add customer self-access ──────────────────────

-- rewards_transactions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rewards_transactions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'rewards_transactions' AND policyname = 'customer_own_rewards_transactions'
    ) THEN
      EXECUTE $inner$
        CREATE POLICY "customer_own_rewards_transactions"
          ON public.rewards_transactions FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.customer_accounts ca
              WHERE ca.auth_user_id = auth.uid()
                AND ca.customer_id  = rewards_transactions.customer_id
                AND ca.tenant_id    = rewards_transactions.tenant_id
                AND ca.status       = 'active'
            )
          )
      $inner$;
    END IF;
  END IF;
END $$;

-- customer_rewards (balances / punch cards)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_rewards') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'customer_rewards' AND policyname = 'customer_own_rewards'
    ) THEN
      EXECUTE $inner$
        CREATE POLICY "customer_own_rewards"
          ON public.customer_rewards FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.customer_accounts ca
              WHERE ca.auth_user_id = auth.uid()
                AND ca.customer_id  = customer_rewards.customer_id
                AND ca.tenant_id    = customer_rewards.tenant_id
                AND ca.status       = 'active'
            )
          )
      $inner$;
    END IF;
  END IF;
END $$;

-- ── 7. RLS on payment_transactions — add customer self-access ────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'payment_transactions' AND policyname = 'customer_own_payment_transactions'
    ) THEN
      EXECUTE $inner$
        CREATE POLICY "customer_own_payment_transactions"
          ON public.payment_transactions FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.customer_accounts ca
              WHERE ca.auth_user_id = auth.uid()
                AND ca.customer_id  = payment_transactions.customer_id
                AND ca.tenant_id    = payment_transactions.tenant_id
                AND ca.status       = 'active'
            )
          )
      $inner$;
    END IF;
  END IF;
END $$;
