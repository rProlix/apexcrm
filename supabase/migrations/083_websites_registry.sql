-- supabase/migrations/083_websites_registry.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Websites & Apps registry — one tenant/business can own MANY separate
-- websites/apps, each with its own unique URL, publish state, and settings.
--
-- This table is an ADDRESSABLE INDEX over the real content stores:
--   • source='builder'   → the tenant's site_settings / site_pages builder
--                          (business / creative websites)
--   • source='pov_event' → a pov_events row (invitation/event website, POV app)
--
-- It is purely ADDITIVE. Existing rendering keeps working:
--   /sites/<tenantSlug>      still renders the builder site
--   /events/<slug>, /pov/<slug> still render the linked pov_event
-- The registry makes each one a distinct record so a Business Website and an
-- Invitation/Event Website never overwrite each other.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.websites (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id              uuid,
  website_type             text        NOT NULL DEFAULT 'business',
  source                   text        NOT NULL DEFAULT 'builder',
  name                     text        NOT NULL DEFAULT 'My Website',
  public_slug              text        NOT NULL,
  subdomain                text,
  custom_domain            text,
  is_primary_business_site boolean     NOT NULL DEFAULT false,
  is_primary_event_site    boolean     NOT NULL DEFAULT false,
  pov_enabled              boolean     NOT NULL DEFAULT false,
  pov_event_id             uuid,
  canva_import_enabled     boolean     NOT NULL DEFAULT false,
  canva_import_id          uuid,
  status                   text        NOT NULL DEFAULT 'draft',
  published_at             timestamptz,
  last_published_version_id uuid,
  settings                 jsonb       NOT NULL DEFAULT '{}',
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT websites_type_check   CHECK (website_type IN ('business','creative','invitational','pov_event')),
  CONSTRAINT websites_source_check CHECK (source IN ('builder','pov_event')),
  CONSTRAINT websites_status_check CHECK (status IN ('draft','published','archived'))
);

-- Slugs are tenant-scoped and unique within a tenant.
CREATE UNIQUE INDEX IF NOT EXISTS websites_tenant_slug_uidx ON public.websites(tenant_id, public_slug);
-- Custom domains + subdomains are globally unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS websites_custom_domain_uidx ON public.websites(lower(custom_domain)) WHERE custom_domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS websites_subdomain_uidx     ON public.websites(lower(subdomain))     WHERE subdomain IS NOT NULL;

CREATE INDEX IF NOT EXISTS websites_tenant_idx   ON public.websites(tenant_id);
CREATE INDEX IF NOT EXISTS websites_type_idx     ON public.websites(website_type);
CREATE INDEX IF NOT EXISTS websites_source_idx   ON public.websites(source);
CREATE INDEX IF NOT EXISTS websites_pov_idx      ON public.websites(pov_event_id);
CREATE INDEX IF NOT EXISTS websites_status_idx   ON public.websites(status);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.websites_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS websites_touch_updated_at ON public.websites;
CREATE TRIGGER websites_touch_updated_at
  BEFORE UPDATE ON public.websites
  FOR EACH ROW EXECUTE FUNCTION public.websites_touch_updated_at();

-- ── RLS (service role + owner + tenant admin/staff) ──────────────────────────
ALTER TABLE public.websites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.websites;
CREATE POLICY service_role_all ON public.websites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS websites_owner ON public.websites;
CREATE POLICY websites_owner ON public.websites
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS websites_admin ON public.websites;
CREATE POLICY websites_admin ON public.websites
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL — create registry rows for existing sites. Wrapped so a failure here
-- never aborts the table creation. App-side ensureWebsiteRegistry() repairs any
-- gaps on next dashboard load, so this is best-effort.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- 1. One builder-backed (business/creative) website per tenant that has site_settings.
  INSERT INTO public.websites (
    tenant_id, website_type, source, name, public_slug, subdomain, custom_domain,
    is_primary_business_site, status, published_at, settings, created_at
  )
  SELECT
    ss.tenant_id,
    CASE WHEN ss.website_type IN ('business','creative') THEN ss.website_type ELSE 'business' END,
    'builder',
    COALESCE(NULLIF(t.name, ''), 'My Website'),
    t.slug,
    ss.subdomain,
    lower(ss.custom_domain),
    true,
    CASE WHEN COALESCE(ss.is_published, false) THEN 'published' ELSE 'draft' END,
    CASE WHEN COALESCE(ss.is_published, false) THEN now() ELSE NULL END,
    '{}'::jsonb,
    now()
  FROM public.site_settings ss
  JOIN public.tenants t ON t.id = ss.tenant_id
  WHERE t.slug IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.websites w
      WHERE w.tenant_id = ss.tenant_id AND w.source = 'builder'
    )
  ON CONFLICT (tenant_id, public_slug) DO NOTHING;

  -- 2. One event-backed website per pov_event.
  INSERT INTO public.websites (
    tenant_id, business_id, website_type, source, name, public_slug,
    is_primary_event_site, pov_enabled, pov_event_id, status, settings, created_at
  )
  SELECT
    pe.tenant_id,
    pe.business_id,
    CASE WHEN ss.pov_event_id = pe.id AND ss.website_type = 'invitational' THEN 'invitational' ELSE 'pov_event' END,
    'pov_event',
    pe.name,
    pe.slug,
    COALESCE(ss.pov_event_id = pe.id, false),
    true,
    pe.id,
    CASE WHEN COALESCE(pe.is_active, true) THEN 'published' ELSE 'draft' END,
    '{}'::jsonb,
    pe.created_at
  FROM public.pov_events pe
  LEFT JOIN public.site_settings ss ON ss.tenant_id = pe.tenant_id
  WHERE NOT EXISTS (
      SELECT 1 FROM public.websites w WHERE w.pov_event_id = pe.id
    )
  ON CONFLICT (tenant_id, public_slug) DO NOTHING;

  -- 3. Point pov_events.website_id at its registry row when not already set.
  UPDATE public.pov_events pe
  SET website_id = w.id
  FROM public.websites w
  WHERE w.pov_event_id = pe.id
    AND (pe.website_id IS NULL OR pe.website_id <> w.id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'websites backfill skipped: %', SQLERRM;
END $$;
