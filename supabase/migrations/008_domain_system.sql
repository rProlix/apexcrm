-- supabase/migrations/008_domain_system.sql
-- Domain system upgrade:
--   • Creates tenant_domains table (custom domain registry with verification)
--   • Adds domain_type to site_settings ('subdomain' | 'custom')
--   • Backfills tenants.subdomain from tenants.slug (canonical alignment)
--   • Seeds site_settings rows for tenants that have none yet
--   • Adds RLS for tenant_domains

-- ─────────────────────────────────────────────────────────────────────────────
-- tenant_domains — verified custom domain registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname   text        NOT NULL,
  verified   boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostname)
);

CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx   ON public.tenant_domains(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_domains_hostname_idx ON public.tenant_domains(hostname);
CREATE INDEX IF NOT EXISTS tenant_domains_verified_idx ON public.tenant_domains(verified);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_settings — add domain_type column
-- ─────────────────────────────────────────────────────────────────────────────
-- Add domain_type column; drop the inline constraint first if it already exists
--   (Postgres does not allow IF NOT EXISTS on named inline CHECK constraints,
--    so we add the column without a name, then add/replace the constraint separately)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS domain_type text NOT NULL DEFAULT 'subdomain';

ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_domain_type_check;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_domain_type_check
  CHECK (domain_type IN ('subdomain', 'custom'));

-- ─────────────────────────────────────────────────────────────────────────────
-- tenants — ensure subdomain mirrors slug for all existing rows
-- (slug is now the canonical identifier; subdomain is a computed alias)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.tenants
  SET subdomain = slug
  WHERE subdomain IS NULL OR subdomain = '';

-- ─────────────────────────────────────────────────────────────────────────────
-- site_settings — seed rows for any active tenant that has none yet
-- Default subdomain = tenant.slug so every tenant has an immediate public URL
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.site_settings (tenant_id, subdomain, domain_type, is_published)
SELECT
  t.id,
  t.slug,
  'subdomain',
  false
FROM public.tenants t
WHERE t.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.site_settings ss WHERE ss.tenant_id = t.id
  )
ON CONFLICT DO NOTHING;

-- Backfill subdomain in existing site_settings rows that have none
UPDATE public.site_settings ss
  SET subdomain = t.slug
  FROM public.tenants t
  WHERE ss.tenant_id = t.id
    AND (ss.subdomain IS NULL OR ss.subdomain = '');

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for tenant_domains
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

-- Drop policies before (re)creating so this migration is idempotent
DROP POLICY IF EXISTS tenant_domains_service_role  ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_owner         ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_admin         ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_customer_read ON public.tenant_domains;

-- Service role bypasses RLS
CREATE POLICY tenant_domains_service_role ON public.tenant_domains
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Platform owner can manage all
CREATE POLICY tenant_domains_owner ON public.tenant_domains
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

-- Tenant admin can manage their own domains
CREATE POLICY tenant_domains_admin ON public.tenant_domains
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'staff')
  );

-- Customers can read their tenant's verified domains
CREATE POLICY tenant_domains_customer_read ON public.tenant_domains
  FOR SELECT TO authenticated
  USING (
    verified = true
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );
