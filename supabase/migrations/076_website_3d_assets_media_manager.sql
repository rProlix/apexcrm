-- ─────────────────────────────────────────────────────────────────────────────
-- 076_website_3d_assets_media_manager.sql
--
-- Extends the Premium 3D Scroll Hero asset table (created in 075) to support the
-- "Premium 3D Scroll Hero Media Manager": selecting/activating an uploaded
-- video or image sequence as the active hero media for a specific section.
--
-- This migration is ADDITIVE and IDEMPOTENT. It does not drop or rewrite any
-- existing data. It:
--   1. Adds richer columns to website_3d_assets (section grouping, media
--      metadata, active flag, ordering).
--   2. Widens the asset_type CHECK to include 'image_sequence_frame' and a
--      'render_mode' CHECK.
--   3. Adds supporting indexes.
--
-- Still NO Spline anywhere.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns (all nullable / defaulted → safe on existing rows) ─────────
ALTER TABLE public.website_3d_assets
  ADD COLUMN IF NOT EXISTS section_id       uuid,
  ADD COLUMN IF NOT EXISTS render_mode      text,
  ADD COLUMN IF NOT EXISTS bucket           text,
  ADD COLUMN IF NOT EXISTS signed_url       text,
  ADD COLUMN IF NOT EXISTS width            integer,
  ADD COLUMN IF NOT EXISTS height           integer,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS frame_count      integer,
  ADD COLUMN IF NOT EXISTS frame_index      integer,
  ADD COLUMN IF NOT EXISTS fps              numeric,
  ADD COLUMN IF NOT EXISTS sort_order       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active        boolean NOT NULL DEFAULT false;

-- ── 2. Widen asset_type CHECK to include image_sequence_frame ─────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_3d_assets_asset_type_check'
      AND conrelid = 'public.website_3d_assets'::regclass
  ) THEN
    ALTER TABLE public.website_3d_assets DROP CONSTRAINT website_3d_assets_asset_type_check;
  END IF;

  ALTER TABLE public.website_3d_assets
    ADD CONSTRAINT website_3d_assets_asset_type_check CHECK (
      asset_type IN (
        'glb','gltf','video','image_sequence','image_sequence_frame',
        'thumbnail','poster','fallback','environment','texture'
      )
    ) NOT VALID; -- NOT VALID: never fail on pre-existing rows
END$$;

-- ── 3. render_mode CHECK (allow NULL for legacy / non-mode assets) ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_3d_assets_render_mode_check'
      AND conrelid = 'public.website_3d_assets'::regclass
  ) THEN
    ALTER TABLE public.website_3d_assets
      ADD CONSTRAINT website_3d_assets_render_mode_check CHECK (
        render_mode IS NULL OR render_mode IN ('three_model','video_scrub')
      ) NOT VALID;
  END IF;
END$$;

-- ── 4. Supporting indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS website_3d_assets_business_idx    ON public.website_3d_assets(business_id);
CREATE INDEX IF NOT EXISTS website_3d_assets_section_idx      ON public.website_3d_assets(section_id);
CREATE INDEX IF NOT EXISTS website_3d_assets_render_mode_idx  ON public.website_3d_assets(render_mode);
CREATE INDEX IF NOT EXISTS website_3d_assets_active_idx       ON public.website_3d_assets(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS website_3d_assets_section_sort_idx ON public.website_3d_assets(section_id, sort_order);
