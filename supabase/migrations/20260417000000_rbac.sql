-- supabase/migrations/20260417000000_rbac.sql
-- ApexCRM — Role-Based Access Control
-- Extends the initial schema with RBAC tables and tightened RLS.

-- ── 1. users: make tenant_id nullable (platform owner has no tenant) ──
ALTER TABLE public.users ALTER COLUMN tenant_id DROP NOT NULL;

-- ── 2. users: normalise role values ───────────────────────────────────
-- Backfill legacy values before adding the check constraint.
UPDATE public.users SET role = 'owner' WHERE role = 'platform_admin';
UPDATE public.users SET role = 'admin' WHERE role NOT IN ('owner', 'admin', 'staff');

ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'admin';

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'staff'));

-- ── 3. customer_accounts: add role column ─────────────────────────────
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer';

ALTER TABLE public.customer_accounts
  ADD CONSTRAINT customer_accounts_role_check
  CHECK (role IN ('customer'));

-- ── 4. Scaffold: roles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  scope      text        NOT NULL CHECK (scope IN ('platform', 'tenant')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Scaffold: permissions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Scaffold: role_permissions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       uuid NOT NULL REFERENCES public.roles(id)       ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ── 7. Seed static roles ──────────────────────────────────────────────
INSERT INTO public.roles (name, scope) VALUES
  ('owner',  'platform'),
  ('admin',  'tenant'),
  ('staff',  'tenant')
ON CONFLICT (name) DO NOTHING;

-- ── 8. Seed permission keys ───────────────────────────────────────────
INSERT INTO public.permissions (key) VALUES
  ('view_dashboard'),
  ('manage_staff'),
  ('view_modules'),
  ('use_modules'),
  ('view_customers'),
  ('manage_customers'),
  ('view_reports'),
  ('view_own_data'),
  ('create_orders'),
  ('view_rewards')
ON CONFLICT (key) DO NOTHING;

-- ── 9. Wire up default role → permissions ─────────────────────────────
DO $$
DECLARE
  r_admin uuid;
  r_staff uuid;
BEGIN
  SELECT id INTO r_admin FROM public.roles WHERE name = 'admin';
  SELECT id INTO r_staff FROM public.roles WHERE name = 'staff';

  -- admin permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r_admin, id FROM public.permissions
  WHERE key IN (
    'view_dashboard','manage_staff','view_modules','use_modules',
    'view_customers','manage_customers','view_reports'
  )
  ON CONFLICT DO NOTHING;

  -- staff permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r_staff, id FROM public.permissions
  WHERE key IN ('view_dashboard','use_modules','view_customers')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── 10. RLS on scaffold tables ────────────────────────────────────────
ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Service-role full access (matches existing pattern for all other tables)
CREATE POLICY "service_role_all" ON public.roles
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.permissions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.role_permissions
  FOR ALL USING (true) WITH CHECK (true);

-- ── 11. Tighten RLS for direct anon-key consumers ────────────────────
--  (Server components use service-role and bypass these; these policies
--   protect against any direct client-side Supabase calls.)

-- users: a logged-in user may read rows from their own tenant
CREATE POLICY "rbac_users_tenant_select" ON public.users
  FOR SELECT
  USING (
    -- platform owner row (no tenant)
    tenant_id IS NULL
    -- same-tenant row via session setting (set by set_tenant_context RPC)
    OR tenant_id::text = coalesce(nullif(current_setting('app.current_tenant_id', true), ''), '00000000-0000-0000-0000-000000000000')
    -- or the row belongs to the authenticated user themselves
    OR auth_user_id = auth.uid()
  );

-- customer_accounts: customer may only read their own account row
CREATE POLICY "rbac_customer_accounts_own_select" ON public.customer_accounts
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR tenant_id::text = coalesce(nullif(current_setting('app.current_tenant_id', true), ''), '00000000-0000-0000-0000-000000000000')
  );

-- customers: accessible within tenant context or by linked portal account
CREATE POLICY "rbac_customers_tenant_select" ON public.customers
  FOR SELECT
  USING (
    tenant_id::text = coalesce(nullif(current_setting('app.current_tenant_id', true), ''), '00000000-0000-0000-0000-000000000000')
    OR EXISTS (
      SELECT 1
      FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.customer_id  = customers.id
        AND ca.tenant_id    = customers.tenant_id
    )
  );

-- ── 12. Helper: check if calling user is the platform owner ───────────
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role         = 'owner'
  );
$$;
