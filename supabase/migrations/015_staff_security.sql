-- supabase/migrations/015_staff_security.sql
-- Staff Security: prevent admins from seeing owner accounts in user queries.
--
-- Problem: the existing rbac_users_tenant_select policy allows any authenticated
-- user to read rows where (tenant_id IS NULL OR tenant_id = current_tenant_id OR
-- auth_user_id = auth.uid()). This can expose the platform owner's row to tenant
-- admins (the IS NULL branch and the auth_user_id = auth.uid() branch).
--
-- Fix: replace the policy with a tighter version that:
--   1. Admins / staff can only SELECT within their tenant AND role != 'owner'
--   2. Owner can SELECT any row
--   3. Any user can always read their own row (for auth flows)

-- ── 1. Drop the existing general tenant-select policy ────────────────────────
DROP POLICY IF EXISTS "rbac_users_tenant_select" ON public.users;

-- ── 2. Admin / staff: read own tenant's non-owner users ──────────────────────
-- Uses auth.uid() to find the caller's tenant_id and role without relying on
-- current_setting (which requires set_tenant_context to be called first).
CREATE POLICY "tenant_staff_select" ON public.users
  FOR SELECT
  USING (
    -- The row being selected must not be an owner account
    role != 'owner'
    AND
    -- The row must belong to the same tenant as the calling user
    tenant_id = (
      SELECT u.tenant_id
      FROM   public.users u
      WHERE  u.auth_user_id = auth.uid()
        AND  u.role        IN ('admin', 'staff')
        AND  u.status       = 'active'
      LIMIT 1
    )
  );

-- ── 3. Any user can read their own row ───────────────────────────────────────
-- Needed for auth flows, profile fetches, and session initialisation.
-- Does NOT leak other users' data.
CREATE POLICY "own_row_select" ON public.users
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- ── 4. Platform owner: full read access ──────────────────────────────────────
CREATE POLICY "owner_users_select" ON public.users
  FOR SELECT
  USING (public.is_platform_owner());

-- ── 5. Tenant admin: write only within their tenant and only non-owner roles ─
-- Prevents admin from:
--   a) inserting/updating users in other tenants
--   b) escalating any user's role to 'owner'
CREATE POLICY "tenant_admin_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    -- Must assign to own tenant
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE  u.auth_user_id = auth.uid() AND u.role = 'admin' AND u.status = 'active'
      LIMIT 1
    )
    -- Role escalation to owner is forbidden
    AND role != 'owner'
  );

CREATE POLICY "tenant_admin_update" ON public.users
  FOR UPDATE
  USING (
    -- Can only update rows in own tenant
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE  u.auth_user_id = auth.uid() AND u.role = 'admin' AND u.status = 'active'
      LIMIT 1
    )
    -- Can never modify owner rows
    AND role != 'owner'
  )
  WITH CHECK (
    -- Cannot change the resulting role to owner
    role != 'owner'
  );

CREATE POLICY "tenant_admin_delete" ON public.users
  FOR DELETE
  USING (
    -- Can only delete rows in own tenant
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE  u.auth_user_id = auth.uid() AND u.role = 'admin' AND u.status = 'active'
      LIMIT 1
    )
    -- Can never delete owner rows
    AND role != 'owner'
  );

-- ── 6. Platform owner: full write access across all tenants ──────────────────
CREATE POLICY "owner_users_all_write" ON public.users
  FOR ALL
  USING  (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- ── 7. Add metadata column for tracking who invited a staff member ────────────
-- Storing invited_by in the existing metadata jsonb column is sufficient;
-- no schema change needed — just document the convention.
--
-- Convention: metadata = { "invited_by": "<admin_user_id>", "invited_at": "<iso>" }
--
-- ── 8. Index to speed up the subquery in the new policies ────────────────────
CREATE INDEX IF NOT EXISTS users_auth_user_role_idx
  ON public.users (auth_user_id, role, status)
  WHERE status = 'active';
