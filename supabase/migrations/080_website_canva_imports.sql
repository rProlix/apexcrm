-- supabase/migrations/080_website_canva_imports.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Canva website import/conversion for Invitation/Event (and POV) websites.
--
-- Fully additive + idempotent. Does NOT touch existing website-builder data.
--
--   1. website_canva_imports — one row per import attempt (preserve or converted).
--   2. site_settings canva_* columns so a site can carry an active import +
--      animation-preservation level alongside POV settings.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — website_canva_imports
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.website_canva_imports (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id            uuid,
  website_id             uuid        NOT NULL,
  pov_event_id           uuid,
  source_type            text        NOT NULL,
  import_mode            text        NOT NULL,
  source_url             text,
  embed_code             text,
  storage_provider       text,
  bucket                 text,
  storage_path           text,
  status                 text        NOT NULL DEFAULT 'draft',
  animation_preservation text        NOT NULL DEFAULT 'unknown',
  import_summary         jsonb       NOT NULL DEFAULT '{}',
  converted_pages        jsonb       NOT NULL DEFAULT '[]',
  converted_assets       jsonb       NOT NULL DEFAULT '[]',
  warnings               jsonb       NOT NULL DEFAULT '[]',
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_canva_source_type_check CHECK (
    source_type IN ('canva_url','embed_code','html_upload','zip_upload','asset_upload','manual')
  ),
  CONSTRAINT website_canva_import_mode_check CHECK (
    import_mode IN ('preserve','converted')
  ),
  CONSTRAINT website_canva_status_check CHECK (
    status IN ('draft','importing','converted','embedded','failed','archived')
  ),
  CONSTRAINT website_canva_anim_check CHECK (
    animation_preservation IN ('exact','approximate','partial','unknown')
  )
);

CREATE INDEX IF NOT EXISTS website_canva_tenant_idx      ON public.website_canva_imports(tenant_id);
CREATE INDEX IF NOT EXISTS website_canva_website_idx     ON public.website_canva_imports(website_id);
CREATE INDEX IF NOT EXISTS website_canva_pov_event_idx   ON public.website_canva_imports(pov_event_id);
CREATE INDEX IF NOT EXISTS website_canva_source_type_idx ON public.website_canva_imports(source_type);
CREATE INDEX IF NOT EXISTS website_canva_import_mode_idx ON public.website_canva_imports(import_mode);
CREATE INDEX IF NOT EXISTS website_canva_status_idx      ON public.website_canva_imports(status);
CREATE INDEX IF NOT EXISTS website_canva_created_at_idx  ON public.website_canva_imports(created_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_canva_imports_updated_at') THEN
    CREATE TRIGGER website_canva_imports_updated_at BEFORE UPDATE ON public.website_canva_imports
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

-- ── RLS (service role + owner/admin), matches 007_website_builder.sql ─────────
ALTER TABLE public.website_canva_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.website_canva_imports;
CREATE POLICY service_role_all ON public.website_canva_imports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS website_canva_owner ON public.website_canva_imports;
CREATE POLICY website_canva_owner ON public.website_canva_imports
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS website_canva_admin ON public.website_canva_imports;
CREATE POLICY website_canva_admin ON public.website_canva_imports
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — site_settings canva columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS canva_import_enabled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canva_import_id             uuid,
  ADD COLUMN IF NOT EXISTS canva_import_mode           text,
  ADD COLUMN IF NOT EXISTS canva_source_url            text,
  ADD COLUMN IF NOT EXISTS canva_embed_code            text,
  ADD COLUMN IF NOT EXISTS canva_animation_preservation text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_canva_mode_check') THEN
    ALTER TABLE public.site_settings
      ADD CONSTRAINT site_settings_canva_mode_check
      CHECK (canva_import_mode IS NULL OR canva_import_mode IN ('preserve','converted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_canva_import_fk') THEN
    ALTER TABLE public.site_settings
      ADD CONSTRAINT site_settings_canva_import_fk
      FOREIGN KEY (canva_import_id) REFERENCES public.website_canva_imports(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS site_settings_canva_import_idx ON public.site_settings(canva_import_id);
