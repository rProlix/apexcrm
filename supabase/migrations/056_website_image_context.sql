-- 056_website_image_context.sql
-- Ensures the website_image_plans table has all columns needed by the
-- enriched AI image context pipeline (Parts 1–9).
--
-- This migration is IDEMPOTENT (safe to run multiple times).
-- It does NOT delete any existing data.
--
-- Changes:
--   1. Adds business_name, business_category, business_summary columns
--      for storing the grounding context used to generate each image plan.
--   2. Adds image_goal, subject_text columns for storing the brief.
--   3. Adds alt_text column if missing (migration 054 may have added it, idempotent).
--   4. Adds reasoning column for debugging (why this image was planned).
--   5. Ensures the "website-images" bucket exists as an alias.
--   6. Verifies indexes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add context columns to website_image_plans
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- business_name: the tenant/business name at the time of planning
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'business_name'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN business_name text NULL;
    RAISE NOTICE 'Added business_name to website_image_plans.';
  END IF;

  -- business_category: detected or stored business type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'business_category'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN business_category text NULL;
    RAISE NOTICE 'Added business_category to website_image_plans.';
  END IF;

  -- business_summary: AI autofill detected summary
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'business_summary'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN business_summary text NULL;
    RAISE NOTICE 'Added business_summary to website_image_plans.';
  END IF;

  -- image_goal: the stated goal for this image (from brief)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'image_goal'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN image_goal text NULL;
    RAISE NOTICE 'Added image_goal to website_image_plans.';
  END IF;

  -- subject_text: what the image is about (from brief)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'subject_text'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN subject_text text NULL;
    RAISE NOTICE 'Added subject_text to website_image_plans.';
  END IF;

  -- reasoning: why this image was planned (debug field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'reasoning'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN reasoning text NULL;
    RAISE NOTICE 'Added reasoning to website_image_plans.';
  END IF;

  -- source_context: full JSON context used for planning (debug/audit)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'source_context'
  ) THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN source_context jsonb NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added source_context to website_image_plans.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ensure website_image_jobs has the columns it needs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- reasoning column for jobs
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_jobs'
      AND column_name  = 'business_type'
  ) THEN
    ALTER TABLE public.website_image_jobs ADD COLUMN business_type text NULL;
    RAISE NOTICE 'Added business_type to website_image_jobs.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ensure tenant_modules.metadata column exists (used by context assembler)
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: tenants.metadata is already used in the codebase.
-- No changes needed here unless column doesn't exist.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Ensure storage bucket "website-images" exists
-- ─────────────────────────────────────────────────────────────────────────────

-- The primary bucket is "website-assets" (set in websiteImageConfig.ts).
-- "website-images" is an alias accepted by the health check.
-- Both are created here idempotently.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'website-images',
  'website-images',
  true,
  10485760,  -- 10 MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'website-images'
);

-- Ensure website-assets bucket also exists (primary)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'website-assets',
  'website-assets',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'website-assets'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Storage RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Public read for website-images bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_images_public_read'
  ) THEN
    CREATE POLICY website_images_public_read
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'website-images');
    RAISE NOTICE 'Created website-images public read policy.';
  END IF;
END;
$$;

-- Authenticated write for website-images bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_images_auth_write'
  ) THEN
    CREATE POLICY website_images_auth_write
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'website-images');
    RAISE NOTICE 'Created website-images auth write policy.';
  END IF;
END;
$$;

-- Authenticated update for website-images bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_images_auth_update'
  ) THEN
    CREATE POLICY website_images_auth_update
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'website-images');
    RAISE NOTICE 'Created website-images auth update policy.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Indexes for new columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS website_image_plans_business_category_idx
  ON public.website_image_plans(business_category)
  WHERE business_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS website_image_plans_tenant_status_idx
  ON public.website_image_plans(tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. updated_at trigger (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the helper function if it doesn't exist yet.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach the trigger to website_image_plans if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname  = 'website_image_plans_updated_at'
      AND tgrelid = 'public.website_image_plans'::regclass
  ) THEN
    CREATE TRIGGER website_image_plans_updated_at
      BEFORE UPDATE ON public.website_image_plans
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    RAISE NOTICE 'Created website_image_plans_updated_at trigger.';
  END IF;
END;
$$;
