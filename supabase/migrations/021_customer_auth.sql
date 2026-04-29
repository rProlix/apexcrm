-- ============================================================
-- Migration 021: Customer Auth — self-service RLS policies
-- ============================================================
-- Customers who sign up via the storefront authenticate with
-- Supabase Auth (email/password). This migration:
--   1. Enables RLS on customer_accounts (if not already)
--   2. Adds policies so customers can read/write their own row
--   3. Adds self-read + self-update policies on the customers table
--   4. Keeps existing staff/admin write policies intact
-- ============================================================

-- ── customer_accounts ─────────────────────────────────────────────────────────

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

-- Drop stale versions before re-creating
DROP POLICY IF EXISTS customer_accounts_self_select  ON public.customer_accounts;
DROP POLICY IF EXISTS customer_accounts_self_insert  ON public.customer_accounts;
DROP POLICY IF EXISTS customer_accounts_self_update  ON public.customer_accounts;
DROP POLICY IF EXISTS customer_accounts_staff_read   ON public.customer_accounts;
DROP POLICY IF EXISTS customer_accounts_staff_write  ON public.customer_accounts;

-- Customer reads their own account (any tenant they belong to)
CREATE POLICY customer_accounts_self_select ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Customer inserts their own account during signup (service role does this,
-- but include for completeness / direct API calls)
CREATE POLICY customer_accounts_self_insert ON public.customer_accounts
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Customer updates their own account
CREATE POLICY customer_accounts_self_update ON public.customer_accounts
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Staff can read all customer_accounts within their own tenant
CREATE POLICY customer_accounts_staff_read ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner', 'staff')
  );

-- Admins/owners can do full CRUD on customer_accounts within their tenant
CREATE POLICY customer_accounts_staff_write ON public.customer_accounts
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

-- ── customers (storefront profile) ────────────────────────────────────────────

-- Drop before re-creating so re-runs are idempotent
DROP POLICY IF EXISTS customers_self_read   ON public.customers;
DROP POLICY IF EXISTS customers_self_update ON public.customers;

-- A customer can read their own row in customers (via the customer_accounts link)
CREATE POLICY customers_self_read ON public.customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.customer_id  = customers.id
        AND ca.auth_user_id = auth.uid()
    )
  );

-- A customer can update their own profile (name, phone — not email/tenant_id)
CREATE POLICY customers_self_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.customer_id  = customers.id
        AND ca.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.customer_id  = customers.id
        AND ca.auth_user_id = auth.uid()
    )
  );

-- ── Helper: resolve customer record for the current auth user ─────────────────
-- Usage: SELECT * FROM get_my_customer_account(tenant_uuid)
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
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_customer_account IS
  'Returns the customer profile for the currently authenticated user within a given tenant.';
