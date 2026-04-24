-- supabase/migrations/007_website_builder.sql
-- Website Builder: site_settings, site_pages, site_sections,
--                  site_navigation_items, site_assets, site_versions, site_analytics
-- All tables are tenant-scoped. RLS enforces isolation.
-- API routes use the service-role client and enforce RBAC in code.

-- ─────────────────────────────────────────────────────────────────────────────
-- site_settings — one row per tenant, stores the full site configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_name      text,
  logo_url       text,
  favicon_url    text,
  brand_colors   jsonb       NOT NULL DEFAULT '{}',
  fonts          jsonb       NOT NULL DEFAULT '{}',
  theme          jsonb       NOT NULL DEFAULT '{}',
  seo_defaults   jsonb       NOT NULL DEFAULT '{}',
  header_config  jsonb       NOT NULL DEFAULT '{}',
  footer_config  jsonb       NOT NULL DEFAULT '{}',
  custom_domain  text        UNIQUE,
  subdomain      text        UNIQUE,
  is_published   boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS site_settings_tenant_idx        ON public.site_settings(tenant_id);
CREATE INDEX IF NOT EXISTS site_settings_custom_domain_idx ON public.site_settings(custom_domain);
CREATE INDEX IF NOT EXISTS site_settings_subdomain_idx     ON public.site_settings(subdomain);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_pages — each page slug + metadata
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_pages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug             text        NOT NULL,
  title            text,
  meta_description text,
  page_type        text        NOT NULL DEFAULT 'custom',
  status           text        NOT NULL DEFAULT 'draft',
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  CONSTRAINT site_pages_page_type_check CHECK (
    page_type IN ('home','shop','product','cart','checkout','account','orders','contact','faq','about','custom')
  ),
  CONSTRAINT site_pages_status_check CHECK (
    status IN ('draft','published','archived')
  )
);

CREATE INDEX IF NOT EXISTS site_pages_tenant_idx    ON public.site_pages(tenant_id);
CREATE INDEX IF NOT EXISTS site_pages_slug_idx      ON public.site_pages(tenant_id, slug);
CREATE INDEX IF NOT EXISTS site_pages_type_idx      ON public.site_pages(page_type);
CREATE INDEX IF NOT EXISTS site_pages_status_idx    ON public.site_pages(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_sections — content blocks within a page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_sections (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id      uuid        NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  section_type text        NOT NULL,
  section_key  text,
  content      jsonb       NOT NULL DEFAULT '{}',
  sort_order   integer     NOT NULL DEFAULT 0,
  is_visible   boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_sections_type_check CHECK (
    section_type IN (
      'hero','feature_grid','image_gallery','product_grid','testimonials',
      'faq','cta','contact','rich_text','banner','about','custom'
    )
  )
);

CREATE INDEX IF NOT EXISTS site_sections_tenant_idx ON public.site_sections(tenant_id);
CREATE INDEX IF NOT EXISTS site_sections_page_idx   ON public.site_sections(page_id);
CREATE INDEX IF NOT EXISTS site_sections_sort_idx   ON public.site_sections(page_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_navigation_items — header and footer link configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_navigation_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label      text        NOT NULL,
  href       text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  is_visible boolean     NOT NULL DEFAULT true,
  location   text        NOT NULL DEFAULT 'header',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_nav_location_check CHECK (location IN ('header','footer'))
);

CREATE INDEX IF NOT EXISTS site_nav_tenant_idx   ON public.site_navigation_items(tenant_id);
CREATE INDEX IF NOT EXISTS site_nav_location_idx ON public.site_navigation_items(tenant_id, location);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_assets — uploaded images, logos, icons
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_assets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_type text        NOT NULL DEFAULT 'image',
  url        text        NOT NULL,
  metadata   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_assets_tenant_idx ON public.site_assets(tenant_id);
CREATE INDEX IF NOT EXISTS site_assets_type_idx   ON public.site_assets(tenant_id, asset_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_versions — draft/published snapshots for rollback
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_name text,
  snapshot     jsonb       NOT NULL DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'draft',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_versions_status_check CHECK (status IN ('draft','published','archived'))
);

CREATE INDEX IF NOT EXISTS site_versions_tenant_idx  ON public.site_versions(tenant_id);
CREATE INDEX IF NOT EXISTS site_versions_status_idx  ON public.site_versions(tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- site_analytics — lightweight page view + event tracking
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_analytics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_slug  text,
  event_type text        NOT NULL DEFAULT 'page_view',
  metadata   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_analytics_tenant_idx ON public.site_analytics(tenant_id);
CREATE INDEX IF NOT EXISTS site_analytics_slug_idx   ON public.site_analytics(tenant_id, page_slug);
CREATE INDEX IF NOT EXISTS site_analytics_event_idx  ON public.site_analytics(tenant_id, event_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at auto-refresh trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER site_pages_updated_at
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER site_sections_updated_at
  BEFORE UPDATE ON public.site_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER site_nav_items_updated_at
  BEFORE UPDATE ON public.site_navigation_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER site_versions_updated_at
  BEFORE UPDATE ON public.site_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_assets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_analytics        ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (matches existing pattern in 005_ecommerce.sql)
CREATE POLICY service_role_all ON public.site_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.site_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.site_sections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.site_navigation_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.site_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.site_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON public.site_analytics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── site_settings ────────────────────────────────────────────────────────────
CREATE POLICY site_settings_owner ON public.site_settings
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_settings_admin ON public.site_settings
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

-- Published site settings are readable by authenticated customers of that tenant
CREATE POLICY site_settings_customer_read ON public.site_settings
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── site_pages ───────────────────────────────────────────────────────────────
CREATE POLICY site_pages_owner ON public.site_pages
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_pages_admin ON public.site_pages
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

CREATE POLICY site_pages_customer_read ON public.site_pages
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── site_sections ─────────────────────────────────────────────────────────────
CREATE POLICY site_sections_owner ON public.site_sections
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_sections_admin ON public.site_sections
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

CREATE POLICY site_sections_customer_read ON public.site_sections
  FOR SELECT TO authenticated
  USING (
    is_visible = true
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── site_navigation_items ─────────────────────────────────────────────────────
CREATE POLICY site_nav_owner ON public.site_navigation_items
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_nav_admin ON public.site_navigation_items
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

CREATE POLICY site_nav_customer_read ON public.site_navigation_items
  FOR SELECT TO authenticated
  USING (
    is_visible = true
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── site_assets ───────────────────────────────────────────────────────────────
CREATE POLICY site_assets_owner ON public.site_assets
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_assets_admin ON public.site_assets
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

CREATE POLICY site_assets_customer_read ON public.site_assets
  FOR SELECT TO authenticated
  USING (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

-- ── site_versions ─────────────────────────────────────────────────────────────
CREATE POLICY site_versions_owner ON public.site_versions
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_versions_admin ON public.site_versions
  FOR ALL TO authenticated
  USING  (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

-- ── site_analytics ────────────────────────────────────────────────────────────
CREATE POLICY site_analytics_owner ON public.site_analytics
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY site_analytics_admin ON public.site_analytics
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin','staff')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed website module for all active tenants that don't already have it
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled, config)
SELECT id, 'website', true, '{}'::jsonb
FROM   public.tenants
WHERE  status = 'active'
  AND  id NOT IN (
    SELECT tenant_id FROM public.tenant_modules WHERE module_key = 'website'
  )
ON CONFLICT DO NOTHING;
