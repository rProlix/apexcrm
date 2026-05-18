-- ============================================================
-- 071_website_templates_system.sql
-- Adds the premium website template system.
-- All alterations are idempotent — safe to re-run.
-- ============================================================

-- ── 1. website_templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_templates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text        UNIQUE NOT NULL,
  name             text        NOT NULL,
  description      text,
  category         text        NOT NULL DEFAULT 'general',
  layout_type      text        NOT NULL DEFAULT 'standard',
  preview_image_url text,
  thumbnail_url    text,
  is_premium       boolean     NOT NULL DEFAULT true,
  is_active        boolean     NOT NULL DEFAULT true,
  animation_level  text        NOT NULL DEFAULT 'balanced'
    CHECK (animation_level IN ('none', 'subtle', 'balanced', 'cinematic')),
  template_schema  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  design_system    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  section_blueprints jsonb     NOT NULL DEFAULT '[]'::jsonb,
  tags             text[]      DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_templates_category_idx
  ON public.website_templates (category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS website_templates_key_idx
  ON public.website_templates (key);

-- ── 2. website_template_applications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_template_applications (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id            uuid        REFERENCES public.website_templates(id) ON DELETE SET NULL,
  template_key           text,
  applied_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_version_id    uuid,
  new_version_id         uuid,
  preserve_brand         boolean     NOT NULL DEFAULT false,
  preserve_images        boolean     NOT NULL DEFAULT true,
  generate_missing_images boolean    NOT NULL DEFAULT false,
  apply_animations       boolean     NOT NULL DEFAULT true,
  status                 text        NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'failed', 'reverted')),
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_template_applications_tenant_idx
  ON public.website_template_applications (tenant_id, created_at DESC);

-- ── 3. site_settings — add template tracking columns ─────────────────────────
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS active_template_id  uuid REFERENCES public.website_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_template_key text,
  ADD COLUMN IF NOT EXISTS template_config     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ensure design_system column exists (migration 069 should have added it)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS design_system jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 4. site_pages — add layout config columns ────────────────────────────────
ALTER TABLE public.site_pages
  ADD COLUMN IF NOT EXISTS layout_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_key  text;

-- ── 5. site_sections — ensure design and template slot columns ───────────────
-- style_config already exists (migration 063/069); template_slot and sort_order may be missing.
ALTER TABLE public.site_sections
  ADD COLUMN IF NOT EXISTS template_slot     text,
  ADD COLUMN IF NOT EXISTS sort_order        integer;

-- Backfill sort_order where null
UPDATE public.site_sections
  SET sort_order = 0
  WHERE sort_order IS NULL;

-- ── 6. Expand site_versions.source constraint for template sources ────────────
ALTER TABLE public.site_versions
  DROP CONSTRAINT IF EXISTS site_versions_source_check;

ALTER TABLE public.site_versions
  ADD CONSTRAINT site_versions_source_check CHECK (
    source IN (
      'manual', 'autosave', 'ai_autofill', 'ai_images', 'ai_animations',
      'ai_restyle', 'before_ai_restyle', 'template_apply', 'before_template_apply',
      'restore', 'publish', 'drag_drop', 'section_edit', 'auto', 'system'
    )
  );

-- ── 7. RLS — website_templates (public read, admin write) ────────────────────
ALTER TABLE public.website_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "website_templates_public_select" ON public.website_templates;
DROP POLICY IF EXISTS "website_templates_service_all"   ON public.website_templates;

CREATE POLICY "website_templates_public_select"
  ON public.website_templates
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "website_templates_service_all"
  ON public.website_templates
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── 8. RLS — website_template_applications ───────────────────────────────────
ALTER TABLE public.website_template_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "website_template_applications_owner_select" ON public.website_template_applications;
DROP POLICY IF EXISTS "website_template_applications_owner_insert" ON public.website_template_applications;
DROP POLICY IF EXISTS "website_template_applications_service_all"  ON public.website_template_applications;

CREATE POLICY "website_template_applications_owner_select"
  ON public.website_template_applications
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "website_template_applications_owner_insert"
  ON public.website_template_applications
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "website_template_applications_service_all"
  ON public.website_template_applications
  FOR ALL
  USING (auth.role() = 'service_role');
