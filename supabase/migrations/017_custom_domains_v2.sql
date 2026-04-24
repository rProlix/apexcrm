-- supabase/migrations/017_custom_domains_v2.sql
-- Full custom domain system upgrade:
--   • Extends tenant_domains with verification, SSL, primary, and metadata columns
--   • Adds domain_mode column to site_settings
--   • Backfills platform subdomain entries for all active tenants
--   • Refreshes RLS policies using users-table role check (not JWT claims)
--   • Adds updated_at trigger

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTEND tenant_domains
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS domain_type         text        NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS is_primary          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_token  text,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS ssl_status          text        NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS metadata            jsonb       DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

-- Drop existing CHECK constraints before recreating (idempotent)
ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_domain_type_check,
  DROP CONSTRAINT IF EXISTS tenant_domains_ssl_status_check,
  DROP CONSTRAINT IF EXISTS tenant_domains_verification_method_check;

ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_domain_type_check
    CHECK (domain_type IN ('subdomain', 'custom')),
  ADD CONSTRAINT tenant_domains_ssl_status_check
    CHECK (ssl_status IN ('pending', 'active', 'failed')),
  ADD CONSTRAINT tenant_domains_verification_method_check
    CHECK (verification_method IS NULL OR verification_method IN ('dns_txt', 'cname', 'manual'));

-- Sync is_verified from existing verified column (keep verified as alias)
UPDATE public.tenant_domains
  SET is_verified = verified
  WHERE is_verified != verified;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTEND site_settings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS domain_mode text NOT NULL DEFAULT 'subdomain';

ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_domain_mode_check;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_domain_mode_check
    CHECK (domain_mode IN ('subdomain', 'custom', 'both'));

-- Widen existing domain_type check to allow 'both'
ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_domain_type_check;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_domain_type_check
    CHECK (domain_type IN ('subdomain', 'custom', 'both'));

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tenant_domains_domain_type_idx
  ON public.tenant_domains(domain_type);
CREATE INDEX IF NOT EXISTS tenant_domains_is_primary_idx
  ON public.tenant_domains(is_primary);
CREATE INDEX IF NOT EXISTS tenant_domains_is_verified_idx
  ON public.tenant_domains(is_verified);
CREATE INDEX IF NOT EXISTS tenant_domains_ssl_status_idx
  ON public.tenant_domains(ssl_status);
CREATE INDEX IF NOT EXISTS site_settings_tenant_id_idx
  ON public.site_settings(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: ensure every active tenant has a platform subdomain row
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.tenant_domains td
  SET
    domain_type  = 'subdomain',
    is_verified  = true,
    verified     = true,
    ssl_status   = 'active',
    is_primary   = true
  FROM public.tenants t
  WHERE td.tenant_id = t.id
    AND td.hostname = t.slug;

INSERT INTO public.tenant_domains
  (tenant_id, hostname, domain_type, is_primary, is_verified, verified, ssl_status)
SELECT
  t.id,
  t.slug,
  'subdomain',
  true,
  true,
  true,
  'active'
FROM public.tenants t
WHERE t.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM   public.tenant_domains td
    WHERE  td.tenant_id   = t.id
      AND  td.domain_type = 'subdomain'
  )
ON CONFLICT (hostname) DO NOTHING;

-- Ensure site_settings rows exist for all active tenants
INSERT INTO public.site_settings (tenant_id, subdomain, domain_type, domain_mode, is_published)
SELECT
  t.id,
  t.slug,
  'subdomain',
  'subdomain',
  false
FROM public.tenants t
WHERE t.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.site_settings ss WHERE ss.tenant_id = t.id
  )
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_tenant_domains_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_domains_updated_at ON public.tenant_domains;
CREATE TRIGGER trg_tenant_domains_updated_at
  BEFORE UPDATE ON public.tenant_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_domains_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES  (drop all, recreate)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_domains_service_role  ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_owner         ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_admin         ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_customer_read ON public.tenant_domains;
DROP POLICY IF EXISTS tenant_domains_anon_read     ON public.tenant_domains;

-- Service role bypasses all RLS
CREATE POLICY tenant_domains_service_role ON public.tenant_domains
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Platform owner — full unrestricted access
CREATE POLICY tenant_domains_owner ON public.tenant_domains
  FOR ALL TO authenticated
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

-- Admin — read/write only their own tenant's domains
CREATE POLICY tenant_domains_admin ON public.tenant_domains
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id    = tenant_domains.tenant_id
        AND u.role         = 'admin'
        AND u.status       = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id    = tenant_domains.tenant_id
        AND u.role         = 'admin'
        AND u.status       = 'active'
    )
  );

-- Customer — read only verified domains for their own tenant
CREATE POLICY tenant_domains_customer_read ON public.tenant_domains
  FOR SELECT TO authenticated
  USING (
    is_verified = true
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.tenant_id    = tenant_domains.tenant_id
        AND u.status       = 'active'
    )
  );

-- Anon/public — read only verified domains (for public site resolution)
CREATE POLICY tenant_domains_anon_read ON public.tenant_domains
  FOR SELECT TO anon
  USING (is_verified = true);
