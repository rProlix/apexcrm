-- ============================================================
-- Migration 020: Onboarding hardening + auth-scoped RLS
-- ============================================================
-- Adds tenant-scoped RLS policies so authenticated users only
-- see data belonging to their own tenant (via JWT tenant_id claim).
-- The service-role policies from 001 / 005 still take precedence
-- for all server-side writes. These new policies cover the cases
-- where the anon or authenticated role is used directly.
-- ============================================================

-- ── Customers ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS customers_tenant_read  ON public.customers;
DROP POLICY IF EXISTS customers_admin_write  ON public.customers;

CREATE POLICY customers_tenant_read ON public.customers
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY customers_admin_write ON public.customers
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

-- ── Appointments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS appointments_tenant_read ON public.appointments;
DROP POLICY IF EXISTS appointments_admin_write ON public.appointments;

CREATE POLICY appointments_tenant_read ON public.appointments
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY appointments_admin_write ON public.appointments
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

-- ── Payments ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS payments_tenant_read ON public.payments;
DROP POLICY IF EXISTS payments_admin_write ON public.payments;

CREATE POLICY payments_tenant_read ON public.payments
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    OR (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY payments_admin_write ON public.payments
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

-- ── Tenant modules ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_modules_read        ON public.tenant_modules;
DROP POLICY IF EXISTS tenant_modules_admin_write ON public.tenant_modules;

CREATE POLICY tenant_modules_read ON public.tenant_modules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id = tenant_modules.tenant_id
    )
    OR (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY tenant_modules_admin_write ON public.tenant_modules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id = tenant_modules.tenant_id
        AND u.role IN ('admin', 'owner')
    )
    OR (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id = tenant_modules.tenant_id
        AND u.role IN ('admin', 'owner')
    )
    OR (auth.jwt() ->> 'role') = 'owner'
  );

-- ── Dashboard layouts ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dashboard_layouts_read  ON public.dashboard_layouts;
DROP POLICY IF EXISTS dashboard_layouts_write ON public.dashboard_layouts;

CREATE POLICY dashboard_layouts_read ON public.dashboard_layouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id = dashboard_layouts.tenant_id
    )
    OR (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY dashboard_layouts_write ON public.dashboard_layouts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id = dashboard_layouts.tenant_id
        AND u.role IN ('admin', 'owner')
    )
    OR (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id = dashboard_layouts.tenant_id
        AND u.role IN ('admin', 'owner')
    )
    OR (auth.jwt() ->> 'role') = 'owner'
  );

-- ── Helper: get current tenant ID from JWT or session ────────────────────────
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'tenant_id')::uuid,
    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
$$;

COMMENT ON FUNCTION public.current_tenant_id IS
  'Returns the tenant UUID from the current JWT claim or session variable.';
