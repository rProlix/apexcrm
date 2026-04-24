-- supabase/migrations/014_module_permissions.sql
-- Module Access Control: RLS policies + index for tenant_modules
-- The tenant_modules table was created in the initial schema (no RLS applied).
-- This migration enables RLS and adds fine-grained access policies.

-- ── 1. Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

-- ── 2. Add module_key index for fast per-module lookups ──────────────────────
CREATE INDEX IF NOT EXISTS tenant_modules_key_idx
  ON public.tenant_modules (module_key);

-- ── 3. Policy: platform owner — full access across all tenants ───────────────
-- Uses is_platform_owner() from the rbac migration (20260417000000_rbac.sql).
CREATE POLICY "owner_full_access" ON public.tenant_modules
  FOR ALL
  USING  (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- ── 4. Policy: tenant admin / staff — read-only for their own tenant ─────────
-- Checks the calling user's auth.uid() against the users table so this works
-- without needing set_tenant_context (important for middleware queries).
CREATE POLICY "tenant_member_select" ON public.tenant_modules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.users u
      WHERE  u.auth_user_id = auth.uid()
        AND  u.tenant_id    = tenant_modules.tenant_id
        AND  u.role        IN ('admin', 'staff')
        AND  u.status       = 'active'
    )
  );

-- ── 5. Policy: customers — no access ─────────────────────────────────────────
-- Absence of a matching policy already denies access, but an explicit deny
-- policy makes the intent clear and prevents accidental access via future roles.
CREATE POLICY "customer_no_access" ON public.tenant_modules
  AS RESTRICTIVE
  FOR ALL
  USING (
    NOT EXISTS (
      SELECT 1
      FROM   public.customer_accounts ca
      WHERE  ca.auth_user_id = auth.uid()
        AND  ca.status       = 'active'
    )
  );

-- ── 6. updated_at trigger ────────────────────────────────────────────────────
-- Keeps updated_at accurate on every row change.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tenant_modules_updated_at'
      AND tgrelid = 'public.tenant_modules'::regclass
  ) THEN
    CREATE TRIGGER tenant_modules_updated_at
      BEFORE UPDATE ON public.tenant_modules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
