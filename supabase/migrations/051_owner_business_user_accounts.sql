-- supabase/migrations/051_owner_business_user_accounts.sql
-- Owner-created business user accounts.
-- Extends public.users (the canonical tenant membership table) with:
--   • full_name, approved, approved_by, approved_at columns
--   • manager role support
--   • status check constraint covering all lifecycle states
--   • additional indexes for efficient lookups
--   • helper SQL functions for callers that need pure-SQL role checks
-- All statements are idempotent.

-- ── 1. Extend public.users with missing columns ───────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name   text,
  ADD COLUMN IF NOT EXISTS approved    boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz DEFAULT now();

-- ── 2. Widen role check to include 'manager' ─────────────────────────────────

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'admin', 'manager', 'staff'));

-- Seed static manager role for RBAC scaffold (idempotent)
INSERT INTO public.roles (name, scope)
  VALUES ('manager', 'tenant')
  ON CONFLICT (name) DO NOTHING;

-- ── 3. Add status check constraint covering all lifecycle states ──────────────
-- Normalise any non-standard values before constraining.

UPDATE public.users
  SET status = 'active'
  WHERE status NOT IN ('active', 'invited', 'pending', 'suspended', 'disabled');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_status_check
    CHECK (status IN ('active', 'invited', 'pending', 'suspended', 'disabled'));

-- ── 4. Additional indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON public.users (lower(email));

CREATE INDEX IF NOT EXISTS users_role_idx
  ON public.users (role);

CREATE INDEX IF NOT EXISTS users_status_idx
  ON public.users (status);

CREATE INDEX IF NOT EXISTS users_tenant_role_idx
  ON public.users (tenant_id, role)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_approved_idx
  ON public.users (tenant_id, approved)
  WHERE approved = false;

-- ── 5. updated_at trigger (safe if function already exists) ──────────────────

CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- ── 6. Helper: is current user a platform owner? (already exists, safe recreate) ──

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role         = 'owner'
  );
$$;

-- ── 7. Helper: is current user the tenant admin or owner? ────────────────────

CREATE OR REPLACE FUNCTION public.is_tenant_admin_or_owner(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND status       = 'active'
      AND (
        role = 'owner'
        OR (role IN ('admin', 'manager') AND tenant_id = p_tenant_id)
      )
  );
$$;

-- ── 8. Update RLS: add manager-role support to existing tenant policies ────────
-- The existing policies in 015_staff_security.sql already cover admin+staff.
-- We add manager to the writable roles list and ensure owner_users_all_write
-- can target manager rows.

-- Drop and recreate tenant_admin_insert to allow manager role as target
DROP POLICY IF EXISTS "tenant_admin_insert" ON public.users;
CREATE POLICY "tenant_admin_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE  u.auth_user_id = auth.uid()
        AND  u.role = 'admin'
        AND  u.status = 'active'
      LIMIT 1
    )
    AND role != 'owner'  -- admins can never insert owner-role rows
  );

DROP POLICY IF EXISTS "tenant_admin_update" ON public.users;
CREATE POLICY "tenant_admin_update" ON public.users
  FOR UPDATE
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE  u.auth_user_id = auth.uid()
        AND  u.role = 'admin'
        AND  u.status = 'active'
      LIMIT 1
    )
    AND role != 'owner'
  )
  WITH CHECK (role != 'owner');

DROP POLICY IF EXISTS "tenant_admin_delete" ON public.users;
CREATE POLICY "tenant_admin_delete" ON public.users
  FOR DELETE
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE  u.auth_user_id = auth.uid()
        AND  u.role = 'admin'
        AND  u.status = 'active'
      LIMIT 1
    )
    AND role != 'owner'
  );

-- ── 9. Service-role explicit policy (if not already present) ─────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'service_role_all_users'
  ) THEN
    CREATE POLICY "service_role_all_users" ON public.users
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
