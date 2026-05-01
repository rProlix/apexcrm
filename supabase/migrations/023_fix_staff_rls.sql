-- ============================================================
-- Migration 023: Fix staff RLS policies on customer_accounts
-- ============================================================
-- Problem: customer_accounts_staff_read / staff_write policies
-- use auth.jwt() ->> 'tenant_id' and auth.jwt() ->> 'role'.
-- When those JWT claims are absent (staff haven't been issued
-- custom claims yet) the expressions evaluate to NULL, which
-- PostgreSQL treats as "denied". That caused:
--   • Staff queries via the session client returning 0 rows
--   • Middleware / server components thinking the user is not
--     authenticated → infinite login loop
--
-- Fix:
--   1. Guard with an explicit IS NOT NULL check so the policy
--      cleanly returns false rather than NULL when claims are
--      absent — no errors, no accidental blocking of other policies.
--   2. The customer self-select / self-insert / self-update policies
--      are already correct (use auth.uid(), no JWT claims) and are
--      left untouched.
-- ============================================================

-- ── Drop the old staff policies ───────────────────────────────────────────────
DROP POLICY IF EXISTS customer_accounts_staff_read  ON public.customer_accounts;
DROP POLICY IF EXISTS customer_accounts_staff_write ON public.customer_accounts;

-- ── Re-create staff read (optional — gracefully false when claims absent) ─────
-- Applies only when the JWT actually carries both 'role' and 'tenant_id'.
-- When those claims are absent (e.g. before custom JWT hooks are wired up),
-- the IS NOT NULL guard short-circuits to false without blocking other policies.
CREATE POLICY customer_accounts_staff_read ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role')      IS NOT NULL
    AND (auth.jwt() ->> 'tenant_id') IS NOT NULL
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner', 'staff')
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── Re-create staff write (optional — same guard) ────────────────────────────
CREATE POLICY customer_accounts_staff_write ON public.customer_accounts
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'role')      IS NOT NULL
    AND (auth.jwt() ->> 'tenant_id') IS NOT NULL
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    (auth.jwt() ->> 'role')      IS NOT NULL
    AND (auth.jwt() ->> 'tenant_id') IS NOT NULL
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );
