-- ─────────────────────────────────────────────────────────────────────────────
-- 077_website_3d_assets_media_studio.sql
--
-- Extends website_3d_assets for the "Premium 3D Scroll Hero Media Studio":
--   • sequence_id   — groups image_sequence_frame rows into one logical sequence
--   • is_archived   — soft-delete / archive instead of hard delete
--   • section_id    — widened to text (builder section IDs may be non-UUID)
--   • supporting indexes
--
-- ADDITIVE + IDEMPOTENT. Does not drop or rewrite existing data. Still NO Spline.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns ───────────────────────────────────────────────────────────
ALTER TABLE public.website_3d_assets
  ADD COLUMN IF NOT EXISTS sequence_id uuid,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- ── 2. Widen section_id to text (existing builder section IDs may be strings) ─
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'website_3d_assets'
    AND column_name = 'section_id';

  IF col_type IS NOT NULL AND col_type <> 'text' THEN
    ALTER TABLE public.website_3d_assets
      ALTER COLUMN section_id TYPE text USING section_id::text;
  END IF;
END$$;

-- ── 3. Supporting indexes (idempotent) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS website_3d_assets_sequence_idx     ON public.website_3d_assets(sequence_id);
CREATE INDEX IF NOT EXISTS website_3d_assets_archived_idx      ON public.website_3d_assets(tenant_id, is_archived);
CREATE INDEX IF NOT EXISTS website_3d_assets_section_type_idx  ON public.website_3d_assets(section_id, asset_type);
CREATE INDEX IF NOT EXISTS website_3d_assets_business_idx2     ON public.website_3d_assets(business_id);
