-- 025_unified_auth_rls.sql
-- Unified auth architecture: ensure business users can always read their
-- own identity row, and customers can always read their own account row.
--
-- This is safe to run multiple times (idempotent DROP + CREATE).

-- ── users table (business identity: owner / admin / staff) ──────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own row
DROP POLICY IF EXISTS users_self_select ON public.users;
CREATE POLICY users_self_select ON public.users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Allow authenticated users to update their own non-sensitive fields
DROP POLICY IF EXISTS users_self_update ON public.users;
CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ── customer_accounts table (customer storefront identity) ───────────────────

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

-- Customers can read their own account rows
DROP POLICY IF EXISTS customer_accounts_self_select ON public.customer_accounts;
CREATE POLICY customer_accounts_self_select ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Customers can update their own account rows
DROP POLICY IF EXISTS customer_accounts_self_update ON public.customer_accounts;
CREATE POLICY customer_accounts_self_update ON public.customer_accounts
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ── Notes ────────────────────────────────────────────────────────────────────
-- Service-role operations (admin inserts, cross-tenant queries) bypass RLS
-- automatically — these policies only govern anon/authenticated JWT requests.
-- Existing admin/owner policies defined in earlier migrations are preserved;
-- only the self-select/self-update policies are managed here.
