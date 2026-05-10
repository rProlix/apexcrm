-- 057_website_generated_images.sql
-- Adds:
--   1. website_generated_images — persistent gallery of every AI-generated image per section
--   2. Aspect ratio safety for website_image_plans (normalize bad values, add CHECK)
--   3. website-images storage bucket (idempotent)
--
-- IDEMPOTENT: safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. website_generated_images table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_generated_images (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_id          uuid        NULL,
  page_id             uuid        NULL REFERENCES public.site_pages(id) ON DELETE SET NULL,
  section_id          uuid        NOT NULL REFERENCES public.site_sections(id) ON DELETE CASCADE,
  image_plan_id       uuid        NULL REFERENCES public.website_image_plans(id) ON DELETE SET NULL,
  image_slot          text        NOT NULL DEFAULT 'primary',
  image_role          text        NULL,
  section_type        text        NULL,
  prompt              text        NOT NULL DEFAULT '',
  model               text        NOT NULL DEFAULT 'imagen-4.0-ultra-generate-001',
  requested_aspect_ratio text     NULL,
  aspect_ratio        text        NOT NULL DEFAULT '16:9',
  bucket              text        NOT NULL DEFAULT 'website-assets',
  storage_path        text        NOT NULL,
  public_url          text        NOT NULL,
  alt_text            text        NULL,
  is_active           boolean     NOT NULL DEFAULT false,
  is_archived         boolean     NOT NULL DEFAULT false,
  generation_status   text        NOT NULL DEFAULT 'ready'
    CHECK (generation_status IN ('ready','failed','archived')),
  generation_error    text        NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by          uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Add CHECK constraint on aspect_ratio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.website_generated_images'::regclass
      AND conname  = 'website_generated_images_aspect_ratio_check'
  ) THEN
    ALTER TABLE public.website_generated_images
      ADD CONSTRAINT website_generated_images_aspect_ratio_check
      CHECK (aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4'));
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Unique constraint: only one active image per tenant+section+slot
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS website_generated_images_one_active_per_slot
  ON public.website_generated_images(tenant_id, section_id, image_slot)
  WHERE is_active = true AND is_archived = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS website_generated_images_tenant_idx
  ON public.website_generated_images(tenant_id);

CREATE INDEX IF NOT EXISTS website_generated_images_section_idx
  ON public.website_generated_images(section_id);

CREATE INDEX IF NOT EXISTS website_generated_images_page_idx
  ON public.website_generated_images(page_id)
  WHERE page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS website_generated_images_plan_idx
  ON public.website_generated_images(image_plan_id)
  WHERE image_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS website_generated_images_tenant_section_slot_idx
  ON public.website_generated_images(tenant_id, section_id, image_slot);

CREATE INDEX IF NOT EXISTS website_generated_images_active_idx
  ON public.website_generated_images(tenant_id, section_id)
  WHERE is_archived = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname  = 'website_generated_images_updated_at'
      AND tgrelid = 'public.website_generated_images'::regclass
  ) THEN
    CREATE TRIGGER website_generated_images_updated_at
      BEFORE UPDATE ON public.website_generated_images
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS for website_generated_images
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.website_generated_images ENABLE ROW LEVEL SECURITY;

-- Drop & recreate policies idempotently
DROP POLICY IF EXISTS wgi_select ON public.website_generated_images;
DROP POLICY IF EXISTS wgi_insert ON public.website_generated_images;
DROP POLICY IF EXISTS wgi_update ON public.website_generated_images;
DROP POLICY IF EXISTS wgi_delete ON public.website_generated_images;

-- Service role has full access
CREATE POLICY wgi_select ON public.website_generated_images
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY wgi_insert ON public.website_generated_images
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin','staff')
    )
  );

CREATE POLICY wgi_update ON public.website_generated_images
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin','staff')
    )
  );

CREATE POLICY wgi_delete ON public.website_generated_images
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Normalize bad aspect ratios in website_image_plans
-- ─────────────────────────────────────────────────────────────────────────────

-- Add requested_aspect_ratio column to store what was originally requested
ALTER TABLE public.website_image_plans
  ADD COLUMN IF NOT EXISTS requested_aspect_ratio text NULL;

-- Repair existing rows with unsupported ratios
DO $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='website_image_plans'
  ) THEN
    -- Save the original value as requested_aspect_ratio where it differs from a supported value
    UPDATE public.website_image_plans
    SET requested_aspect_ratio = aspect_ratio
    WHERE aspect_ratio IS NOT NULL
      AND aspect_ratio NOT IN ('1:1','9:16','16:9','4:3','3:4')
      AND (requested_aspect_ratio IS NULL OR requested_aspect_ratio = aspect_ratio);

    -- Map unsupported → nearest supported
    UPDATE public.website_image_plans
    SET aspect_ratio = CASE aspect_ratio
      WHEN '3:2'   THEN '4:3'
      WHEN '2:3'   THEN '3:4'
      WHEN '4:5'   THEN '3:4'
      WHEN '5:4'   THEN '4:3'
      WHEN '21:9'  THEN '16:9'
      WHEN '16:10' THEN '16:9'
      WHEN '10:16' THEN '9:16'
      WHEN '2:1'   THEN '16:9'
      WHEN '1:2'   THEN '9:16'
      ELSE '16:9'
    END
    WHERE aspect_ratio NOT IN ('1:1','9:16','16:9','4:3','3:4');

    -- NULL aspect ratios default to 16:9
    UPDATE public.website_image_plans
    SET aspect_ratio = '16:9'
    WHERE aspect_ratio IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Normalized % website_image_plans aspect_ratio rows.', v_updated;
  END IF;
END;
$$;

-- Add / re-apply CHECK constraint on aspect_ratio (idempotent)
DO $$
BEGIN
  -- Drop any old conflicting check
  DECLARE r record;
  BEGIN
    FOR r IN (
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.website_image_plans'::regclass
        AND contype  = 'c'
        AND pg_get_constraintdef(oid) LIKE '%aspect_ratio%'
    ) LOOP
      EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', r.conname);
      RAISE NOTICE 'Dropped old aspect_ratio constraint % from website_image_plans.', r.conname;
    END LOOP;
  END;
END;
$$;

ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_aspect_ratio_check
  CHECK (aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Ensure storage buckets exist
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'website-assets','website-assets',true,10485760,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='website-assets');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'website-images','website-images',true,10485760,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='website-images');
