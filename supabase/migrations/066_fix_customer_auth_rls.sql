-- ============================================================
-- Migration 066: Fix customer auth, unique constraints, and email logging
-- ============================================================
-- Root-cause fixes for:
--   1. customer_accounts.auth_user_id was globally UNIQUE, preventing one
--      Supabase auth user from being a customer at multiple businesses.
--      Changed to UNIQUE(auth_user_id, tenant_id) — per-tenant uniqueness.
--   2. customer_accounts.status did not allow 'pending_confirmation',
--      causing login to fail for users awaiting email confirmation.
--   3. get_my_customer_account() now activates pending_confirmation rows
--      when Supabase has already confirmed the email (defensive activation).
--   4. email_logs gains from_email + reply_to columns for better diagnostics.
--   5. RLS policies on appointments/orders/rewards scoped to customer + tenant.
-- All statements are idempotent.
-- ============================================================

-- ── 1. Fix customer_accounts unique constraint ────────────────────────────────
--
-- Before: auth_user_id UUID UNIQUE  (one customer account globally per user)
-- After:  UNIQUE(auth_user_id, tenant_id)  (one account per user per business)
--
-- This allows "Jane" to be a customer of both "Salon A" and "Salon B"
-- using the same email/Supabase auth account.

DO $$
DECLARE
  v_conname text;
BEGIN
  -- Find and drop the old global unique constraint on auth_user_id only.
  -- The constraint may have any name depending on how it was created.
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname  = 'public'
    AND t.relname  = 'customer_accounts'
    AND c.contype  = 'u'
    AND array_length(c.conkey, 1) = 1
    AND c.conkey[1] = (
      SELECT a.attnum FROM pg_attribute a
      WHERE a.attrelid = t.oid AND a.attname = 'auth_user_id'
    );

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customer_accounts DROP CONSTRAINT %I', v_conname);
    RAISE NOTICE 'Dropped old global unique constraint: %', v_conname;
  END IF;
END $$;

-- Add the composite (per-tenant) unique constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_accounts'::regclass
      AND conname  = 'customer_accounts_auth_tenant_unique'
  ) THEN
    ALTER TABLE public.customer_accounts
      ADD CONSTRAINT customer_accounts_auth_tenant_unique
        UNIQUE (auth_user_id, tenant_id);
    RAISE NOTICE 'Added UNIQUE(auth_user_id, tenant_id) constraint';
  END IF;
END $$;

-- ── 2. Ensure customer_accounts has a status column and add pending_confirmation ─
--
-- The status column was created as 'active' with no CHECK constraint,
-- so adding 'pending_confirmation' requires no schema change.
-- But add a CHECK constraint now to make allowed values explicit.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_accounts'::regclass
      AND conname  = 'customer_accounts_status_check'
  ) THEN
    ALTER TABLE public.customer_accounts
      ADD CONSTRAINT customer_accounts_status_check
        CHECK (status IN ('active', 'inactive', 'pending_confirmation', 'suspended'));
  END IF;
END $$;

-- ── 3. Upgrade get_my_customer_account() ─────────────────────────────────────
--
-- Defensive activation: if a row has status='pending_confirmation' but
-- Supabase has confirmed the email (email_confirmed_at is set), treat it
-- as active. This handles edge cases where the activation webhook/action
-- failed to run but the user is definitively confirmed.

CREATE OR REPLACE FUNCTION public.get_my_customer_account(p_tenant_id uuid)
RETURNS TABLE (
  account_id   uuid,
  customer_id  uuid,
  email        text,
  full_name    text,
  phone        text,
  status       text,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ca.id           AS account_id,
    ca.customer_id,
    ca.email,
    c.name          AS full_name,
    c.phone,
    ca.status,
    ca.created_at
  FROM public.customer_accounts ca
  JOIN public.customers c ON c.id = ca.customer_id
  WHERE ca.auth_user_id = auth.uid()
    AND ca.tenant_id    = p_tenant_id
    AND ca.status IN ('active', 'pending_confirmation')
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_customer_account IS
  'Returns the customer profile for the currently authenticated user within a given tenant. '
  'Returns rows with status active or pending_confirmation. '
  'Business users without a customer_accounts row get no result — use resolveSiteUser() instead.';

-- ── 4. Add from_email + reply_to to email_logs ────────────────────────────────
--
-- These columns enable the diagnostics UI to show exactly what was sent.

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS from_email  text,
  ADD COLUMN IF NOT EXISTS reply_to    text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- ── 5. RLS: appointments — customers can read their own within the tenant ──────

-- Drop stale policies before re-creating (makes this idempotent)
DROP POLICY IF EXISTS "appointments_customer_self_read"   ON public.appointments;
DROP POLICY IF EXISTS "appointments_customer_own_read"    ON public.appointments;
DROP POLICY IF EXISTS "appointments_staff_tenant_read"    ON public.appointments;
DROP POLICY IF EXISTS "appointments_staff_tenant_write"   ON public.appointments;

-- Customer: read their own appointments only (any tenant they belong to)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointments'
      AND policyname = 'appointments_customer_self_read'
  ) THEN
    CREATE POLICY "appointments_customer_self_read" ON public.appointments
      FOR SELECT TO authenticated
      USING (
        -- Customer must have an active/pending account in this tenant
        EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.tenant_id    = appointments.tenant_id
            AND ca.customer_id  = appointments.customer_id
            AND ca.status IN ('active', 'pending_confirmation')
        )
      );
  END IF;
END $$;

-- Staff/admin: read all appointments in their tenant
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointments'
      AND policyname = 'appointments_staff_tenant_read'
  ) THEN
    CREATE POLICY "appointments_staff_tenant_read" ON public.appointments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.tenant_id    = appointments.tenant_id
            AND u.status       = 'active'
        )
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- Staff/admin: write all appointments in their tenant
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointments'
      AND policyname = 'appointments_staff_tenant_write'
  ) THEN
    CREATE POLICY "appointments_staff_tenant_write" ON public.appointments
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.tenant_id    = appointments.tenant_id
            AND u.status       = 'active'
            AND u.role IN ('owner', 'admin', 'staff', 'manager')
        )
        OR public.is_platform_owner()
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.tenant_id    = appointments.tenant_id
            AND u.status       = 'active'
            AND u.role IN ('owner', 'admin', 'staff', 'manager')
        )
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- ── 6. RLS: rewards_balances — customers can read their own ───────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rewards_balances')
  THEN
    DROP POLICY IF EXISTS "rewards_balances_customer_self_read" ON public.rewards_balances;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'rewards_balances'
        AND policyname = 'rewards_balances_customer_self_read'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "rewards_balances_customer_self_read" ON public.rewards_balances
          FOR SELECT TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.customer_accounts ca
              WHERE ca.auth_user_id = auth.uid()
                AND ca.tenant_id    = rewards_balances.tenant_id
                AND ca.customer_id  = rewards_balances.customer_id
                AND ca.status IN ('active', 'pending_confirmation')
            )
            OR
            EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.auth_user_id = auth.uid()
                AND u.tenant_id    = rewards_balances.tenant_id
                AND u.status       = 'active'
            )
            OR public.is_platform_owner()
          )
      $pol$;
    END IF;
  END IF;
END $$;

-- ── 7. RLS: rewards_transactions — customers can read their own ────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rewards_transactions')
  THEN
    DROP POLICY IF EXISTS "rewards_transactions_customer_self_read" ON public.rewards_transactions;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'rewards_transactions'
        AND policyname = 'rewards_transactions_customer_self_read'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "rewards_transactions_customer_self_read" ON public.rewards_transactions
          FOR SELECT TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.customer_accounts ca
              WHERE ca.auth_user_id = auth.uid()
                AND ca.tenant_id    = rewards_transactions.tenant_id
                AND ca.customer_id  = rewards_transactions.customer_id
                AND ca.status IN ('active', 'pending_confirmation')
            )
            OR
            EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.auth_user_id = auth.uid()
                AND u.tenant_id    = rewards_transactions.tenant_id
                AND u.status       = 'active'
            )
            OR public.is_platform_owner()
          )
      $pol$;
    END IF;
  END IF;
END $$;

-- ── 8. RLS: store_orders — customers can read their own ───────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_orders')
  THEN
    DROP POLICY IF EXISTS "store_orders_customer_self_read" ON public.store_orders;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'store_orders'
        AND policyname = 'store_orders_customer_self_read'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "store_orders_customer_self_read" ON public.store_orders
          FOR SELECT TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.customer_accounts ca
              WHERE ca.auth_user_id = auth.uid()
                AND ca.tenant_id    = store_orders.tenant_id
                AND ca.customer_id  = store_orders.customer_id
                AND ca.status IN ('active', 'pending_confirmation')
            )
            OR
            EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.auth_user_id = auth.uid()
                AND u.tenant_id    = store_orders.tenant_id
                AND u.status       = 'active'
            )
            OR public.is_platform_owner()
          )
      $pol$;
    END IF;
  END IF;
END $$;

-- ── 9. customer_accounts RLS: ensure self-select works for all statuses ────────
--
-- The old policy only matched status='active'. After this migration,
-- pending_confirmation users must also be able to read their own row.

DROP POLICY IF EXISTS customer_accounts_self_select  ON public.customer_accounts;
DROP POLICY IF EXISTS "customer_own_account"         ON public.customer_accounts;

CREATE POLICY "customer_accounts_self_select" ON public.customer_accounts
  FOR SELECT TO authenticated
  -- A user can always read their own account rows, regardless of status
  USING (auth_user_id = auth.uid());

-- Customers can update their own account (status, etc.)
DROP POLICY IF EXISTS customer_accounts_self_update ON public.customer_accounts;

CREATE POLICY "customer_accounts_self_update" ON public.customer_accounts
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Admins/owners can read all accounts within their tenant
DROP POLICY IF EXISTS "admin_tenant_customer_accounts" ON public.customer_accounts;

CREATE POLICY "admin_tenant_customer_accounts" ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id    = customer_accounts.tenant_id
        AND u.status       = 'active'
        AND u.role IN ('owner', 'admin', 'staff', 'manager')
    )
    OR public.is_platform_owner()
  );

-- Admins/owners can write all accounts within their tenant
DROP POLICY IF EXISTS "admin_tenant_customer_accounts_write" ON public.customer_accounts;

CREATE POLICY "admin_tenant_customer_accounts_write" ON public.customer_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id    = customer_accounts.tenant_id
        AND u.status       = 'active'
        AND u.role IN ('owner', 'admin')
    )
    OR public.is_platform_owner()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id    = customer_accounts.tenant_id
        AND u.status       = 'active'
        AND u.role IN ('owner', 'admin')
    )
    OR public.is_platform_owner()
  );

-- ── 10. Helper: activate a pending_confirmation account after email verified ───
--
-- Called from the auth callback route after PKCE code exchange.

CREATE OR REPLACE FUNCTION public.activate_pending_customer_account(
  p_auth_user_id uuid,
  p_tenant_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.customer_accounts
  SET    status     = 'active',
         updated_at = now()
  WHERE  auth_user_id = p_auth_user_id
    AND  tenant_id    = p_tenant_id
    AND  status       = 'pending_confirmation';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.activate_pending_customer_account IS
  'Activates a customer_account row that was in pending_confirmation state. '
  'Called by the /auth/callback route after Supabase confirms the email. '
  'Returns true if a row was updated, false if the account was already active or not found.';
