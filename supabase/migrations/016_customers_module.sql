-- supabase/migrations/016_customers_module.sql
-- Customers Module: global identity, tenant profiles, notes, RLS hardening

-- ── 1. Global customer identity (cross-tenant, platform-level) ────────────────
-- A single real-world person can have one identity record, optionally linked
-- from many tenant-scoped customers records.  Identity records are never
-- directly visible to tenant admins — only the service role uses them.
CREATE TABLE IF NOT EXISTS public.customer_identities (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  phone      text,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_identities_email_uidx
  ON public.customer_identities (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_identities_phone_idx
  ON public.customer_identities (phone)
  WHERE phone IS NOT NULL;

-- ── 2. Extend existing per-tenant customers table ─────────────────────────────
-- The public.customers table already has tenant_id (per-tenant customer record).
-- We add an optional link to the global identity and a status/display_name field.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_identity_id uuid
    REFERENCES public.customer_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS customers_identity_idx
  ON public.customers (customer_identity_id)
  WHERE customer_identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_phone_idx
  ON public.customers (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_status_idx
  ON public.customers (tenant_id, status);

-- ── 3. Customer profiles (per-tenant preferences + notes) ────────────────────
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id      uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  preferences      jsonb       NOT NULL DEFAULT '{}',
  notes            jsonb       NOT NULL DEFAULT '[]',
  marketing_opt_in boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS customer_profiles_tenant_idx
  ON public.customer_profiles (tenant_id);

CREATE INDEX IF NOT EXISTS customer_profiles_customer_idx
  ON public.customer_profiles (customer_id);

-- ── 4. updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_customer_identities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_customer_identities_updated_at ON public.customer_identities;
CREATE TRIGGER trg_customer_identities_updated_at
  BEFORE UPDATE ON public.customer_identities
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_identities_updated_at();

CREATE OR REPLACE FUNCTION public.set_customer_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_customer_profiles_updated_at ON public.customer_profiles;
CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_profiles_updated_at();

-- ── 5. RLS on customer_identities ────────────────────────────────────────────
ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;

-- Identity records are private — only service_role (our API server) can read/write them.
-- No tenant admin or customer can directly query this table.
DROP POLICY IF EXISTS "service_role_customer_identities" ON public.customer_identities;
CREATE POLICY "service_role_customer_identities"
  ON public.customer_identities FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── 6. RLS on customer_profiles ──────────────────────────────────────────────
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_customer_profiles" ON public.customer_profiles;
CREATE POLICY "service_role_customer_profiles"
  ON public.customer_profiles FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Owner: full access across all tenants
DROP POLICY IF EXISTS "owner_all_customer_profiles" ON public.customer_profiles;
CREATE POLICY "owner_all_customer_profiles"
  ON public.customer_profiles FOR ALL
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

-- Admin/staff: only their own tenant's profiles
DROP POLICY IF EXISTS "admin_tenant_customer_profiles" ON public.customer_profiles;
CREATE POLICY "admin_tenant_customer_profiles"
  ON public.customer_profiles FOR ALL
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

-- Customer: read-only access to their own profile in their own tenant
DROP POLICY IF EXISTS "customer_own_profile_select" ON public.customer_profiles;
CREATE POLICY "customer_own_profile_select"
  ON public.customer_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.customer_id  = customer_profiles.customer_id
        AND ca.tenant_id    = customer_profiles.tenant_id
        AND ca.status = 'active'
    )
  );

-- ── 7. Harden RLS on public.customers ────────────────────────────────────────
-- Drop any pre-existing authenticated policies and replace with strict ones.
-- (Service-role pass-through remains unchanged from initial schema if present.)

DROP POLICY IF EXISTS "Tenant isolation for customers"       ON public.customers;
DROP POLICY IF EXISTS "tenant_customers_select"              ON public.customers;
DROP POLICY IF EXISTS "tenant_customers_insert"              ON public.customers;
DROP POLICY IF EXISTS "tenant_customers_update"              ON public.customers;
DROP POLICY IF EXISTS "tenant_customers_delete"              ON public.customers;
DROP POLICY IF EXISTS "owner_all_customers"                  ON public.customers;
DROP POLICY IF EXISTS "admin_tenant_customers"               ON public.customers;
DROP POLICY IF EXISTS "customer_own_record"                  ON public.customers;

CREATE POLICY "service_role_all_customers" ON public.customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "owner_all_customers" ON public.customers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active')
  );

-- Admin/staff see only their own tenant's customers — no cross-tenant reads
CREATE POLICY "admin_tenant_customers" ON public.customers
  FOR ALL TO authenticated
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

-- Customer: read-only, scoped to their own record in their tenant
CREATE POLICY "customer_own_record" ON public.customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.customer_id  = customers.id
        AND ca.tenant_id    = customers.tenant_id
        AND ca.status = 'active'
    )
  );

-- ── 8. Harden RLS on public.customer_accounts ────────────────────────────────
DROP POLICY IF EXISTS "Tenant isolation for customer_accounts" ON public.customer_accounts;
DROP POLICY IF EXISTS "owner_all_customer_accounts"            ON public.customer_accounts;
DROP POLICY IF EXISTS "admin_tenant_customer_accounts"         ON public.customer_accounts;
DROP POLICY IF EXISTS "customer_own_account"                   ON public.customer_accounts;

CREATE POLICY "service_role_all_customer_accounts" ON public.customer_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "owner_all_customer_accounts" ON public.customer_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active')
  );

CREATE POLICY "admin_tenant_customer_accounts" ON public.customer_accounts
  FOR ALL TO authenticated
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

-- Customer can see only their own account record (by auth UID)
CREATE POLICY "customer_own_account" ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- ── 9. Harden RLS on orders (cross-tenant leakage prevention) ────────────────
-- Only reinforce; do not break existing ecommerce policies.
DROP POLICY IF EXISTS "customer_own_orders"  ON public.orders;
DROP POLICY IF EXISTS "admin_tenant_orders"  ON public.orders;
DROP POLICY IF EXISTS "owner_all_orders"     ON public.orders;
DROP POLICY IF EXISTS "Tenant isolation for orders" ON public.orders;

CREATE POLICY "service_role_all_orders" ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "owner_all_orders" ON public.orders
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active')
  );

CREATE POLICY "admin_tenant_orders" ON public.orders
  FOR ALL TO authenticated
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

-- Customer: only their own orders in their own tenant
CREATE POLICY "customer_own_orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.customer_id  = orders.customer_id
        AND ca.tenant_id    = orders.tenant_id
        AND ca.status = 'active'
    )
  );
