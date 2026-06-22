-- ─────────────────────────────────────────────────────────────────────────────
-- 075_website_3d_scroll_hero.sql
--
-- Adds support for the "Premium 3D Scroll Hero" website-builder section.
--
-- Render modes supported by the new section (NO Spline):
--   • three_model  — real-time GLB/GLTF via Three.js / React Three Fiber
--   • video_scrub  — scroll-scrubbed H.264 MP4 video and/or image sequences
--
-- This migration is additive and idempotent. It does NOT drop or rewrite any
-- existing website data. It:
--   1. Creates website_3d_assets         (uploaded models / videos / posters …)
--   2. Creates website_scroll_story_presets (industry presets for the section)
--   3. Relaxes the legacy site_sections type CHECK so the new section type
--      (and other already-shipping types) can be stored
--   4. Seeds system scroll-story presets
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. website_3d_assets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_3d_assets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_id       uuid,
  business_id      uuid,
  name             text        NOT NULL,
  asset_type       text        NOT NULL,
  storage_provider text,
  storage_path     text,
  public_url       text,
  file_size_bytes  bigint,
  mime_type        text,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_by        uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_3d_assets_asset_type_check CHECK (
    asset_type IN (
      'glb','gltf','video','image_sequence','thumbnail',
      'poster','fallback','environment','texture'
    )
  )
);

CREATE INDEX IF NOT EXISTS website_3d_assets_tenant_idx     ON public.website_3d_assets(tenant_id);
CREATE INDEX IF NOT EXISTS website_3d_assets_website_idx    ON public.website_3d_assets(website_id);
CREATE INDEX IF NOT EXISTS website_3d_assets_type_idx       ON public.website_3d_assets(tenant_id, asset_type);
CREATE INDEX IF NOT EXISTS website_3d_assets_created_idx    ON public.website_3d_assets(tenant_id, created_at DESC);

-- ── 2. website_scroll_story_presets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_scroll_story_presets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  industry     text,
  name         text        NOT NULL,
  description  text,
  render_mode  text        NOT NULL,
  config       jsonb       NOT NULL DEFAULT '{}',
  is_system    boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_scroll_story_presets_render_mode_check CHECK (
    render_mode IN ('three_model','video_scrub')
  )
);

CREATE INDEX IF NOT EXISTS website_scroll_story_presets_tenant_idx   ON public.website_scroll_story_presets(tenant_id);
CREATE INDEX IF NOT EXISTS website_scroll_story_presets_industry_idx ON public.website_scroll_story_presets(industry);
CREATE INDEX IF NOT EXISTS website_scroll_story_presets_system_idx   ON public.website_scroll_story_presets(is_system);

-- ── updated_at triggers (reuse existing touch_updated_at) ─────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'touch_updated_at') THEN
    DROP TRIGGER IF EXISTS website_3d_assets_updated_at ON public.website_3d_assets;
    CREATE TRIGGER website_3d_assets_updated_at
      BEFORE UPDATE ON public.website_3d_assets
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

    DROP TRIGGER IF EXISTS website_scroll_story_presets_updated_at ON public.website_scroll_story_presets;
    CREATE TRIGGER website_scroll_story_presets_updated_at
      BEFORE UPDATE ON public.website_scroll_story_presets
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END$$;

-- ── 3. Relax legacy site_sections type CHECK ─────────────────────────────────
-- The original 007 constraint omitted several already-shipping types
-- (e.g. product_360_viewer). Replace it with an inclusive list that also
-- allows the new premium_3d_scroll_hero section. Safe + idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_sections_type_check'
      AND conrelid = 'public.site_sections'::regclass
  ) THEN
    ALTER TABLE public.site_sections DROP CONSTRAINT site_sections_type_check;
  END IF;

  ALTER TABLE public.site_sections
    ADD CONSTRAINT site_sections_type_check CHECK (
      section_type IN (
        'hero','feature_grid','image_gallery','gallery','product_grid',
        'testimonials','faq','cta','contact','rich_text','banner','about',
        'product_360','product_360_viewer','premium_3d_scroll_hero','custom'
      )
    ) NOT VALID;  -- NOT VALID: do not fail on pre-existing rows with other types
END$$;

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.website_3d_assets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_story_presets  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.website_3d_assets;
CREATE POLICY service_role_all ON public.website_3d_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON public.website_scroll_story_presets;
CREATE POLICY service_role_all ON public.website_scroll_story_presets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Owners/admins manage their own tenant's 3D assets
DROP POLICY IF EXISTS website_3d_assets_tenant ON public.website_3d_assets;
CREATE POLICY website_3d_assets_tenant ON public.website_3d_assets
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'owner'
    OR (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'owner'
    OR (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  );

-- Presets: system presets readable by everyone; tenant presets by their tenant
DROP POLICY IF EXISTS website_scroll_story_presets_read ON public.website_scroll_story_presets;
CREATE POLICY website_scroll_story_presets_read ON public.website_scroll_story_presets
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR (auth.jwt() ->> 'role') = 'owner'
    OR tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

DROP POLICY IF EXISTS website_scroll_story_presets_write ON public.website_scroll_story_presets;
CREATE POLICY website_scroll_story_presets_write ON public.website_scroll_story_presets
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'owner'
    OR (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'owner'
    OR (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  );

-- ── 5. Seed system scroll-story presets ──────────────────────────────────────
-- tenant_id NULL + is_system true = global presets available to all tenants.
INSERT INTO public.website_scroll_story_presets (industry, name, description, render_mode, config, is_system)
SELECT v.industry, v.name, v.description, v.render_mode, v.config::jsonb, true
FROM (VALUES
  ('retail',       'Product Spin Hero',        'A product rotates in 3D revealing every angle as the visitor scrolls.', 'three_model', '{"presetKey":"product_spin","animationPreset":"productSpin","lightingPreset":"studioSoftbox","environmentPreset":"studio","initialRotation":{"x":0,"y":0,"z":0},"targetRotation":{"x":0,"y":6.28,"z":0},"cameraZoom":1,"stageRevealMode":"none","textAnimation":"fadeUpWords"}'),
  ('construction', 'Construction Build Scroll', 'Foundation to finished home reveals stage by stage on scroll.',        'video_scrub', '{"presetKey":"construction_build","animationPreset":"stageReveal","stageRevealMode":"sequential","useImageSequence":true,"textAnimation":"blurReveal","mobileFallbackMode":"poster"}'),
  ('automotive',   'Vehicle Showroom Orbit',   'A vehicle orbits like a premium showroom turntable as you scroll.',    'three_model', '{"presetKey":"vehicle_showroom","animationPreset":"showroomOrbit","lightingPreset":"showroom","environmentPreset":"city","initialRotation":{"x":0,"y":-0.6,"z":0},"targetRotation":{"x":0,"y":2.4,"z":0},"cameraZoom":1.1,"textAnimation":"luxurySplit"}'),
  ('legal',        'Luxury Service Abstract',  'A refined abstract premium scene for professional services.',          'three_model', '{"presetKey":"luxury_abstract","animationPreset":"premiumAbstract","lightingPreset":"luxuryGlow","environmentPreset":"none","shaderPreset":"premiumGlow","textAnimation":"luxurySplit"}'),
  ('restaurant',   'Restaurant Dish Reveal',   'Ingredients assemble into a finished dish through scroll.',             'video_scrub', '{"presetKey":"dish_reveal","animationPreset":"stageReveal","useImageSequence":false,"textAnimation":"scaleWords","mobileFallbackMode":"poster"}'),
  ('entertainment','Character Mascot Intro',   'A brand character or mascot animates in on scroll.',                   'three_model', '{"presetKey":"mascot_intro","animationPreset":"characterIntro","lightingPreset":"premiumSpotlight","environmentPreset":"studio","textAnimation":"scaleWords"}'),
  ('beauty',       'Salon Before/After',       'A before/after makeover story revealed by scrolling.',                  'video_scrub', '{"presetKey":"salon_makeover","animationPreset":"beforeAfter","useImageSequence":true,"textAnimation":"fadeUpWords","mobileFallbackMode":"poster"}'),
  ('trades',       'Trades Tool Orbit',        'Tools, pipes and water flow orbit through the service steps.',         'three_model', '{"presetKey":"trades_tool_orbit","animationPreset":"toolOrbit","lightingPreset":"outdoorConstruction","environmentPreset":"warehouse","textAnimation":"fadeUpWords"}')
) AS v(industry, name, description, render_mode, config)
WHERE NOT EXISTS (
  SELECT 1 FROM public.website_scroll_story_presets p
  WHERE p.is_system = true AND p.name = v.name
);
