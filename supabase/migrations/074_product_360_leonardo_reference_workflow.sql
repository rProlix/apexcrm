-- Migration 074: Product 360 Leonardo reference workflow
-- Idempotent. Adds reference-first Leonardo fields, frame tracking columns,
-- status constraints, indexes, and Supabase Storage buckets/policies.

BEGIN;

-- Packages: reference workflow, provider aliases, and diagnostics.
ALTER TABLE public.product_360_packages
  ADD COLUMN IF NOT EXISTS reference_image_url text,
  ADD COLUMN IF NOT EXISTS reference_image_path text,
  ADD COLUMN IF NOT EXISTS reference_image_storage_path text,
  ADD COLUMN IF NOT EXISTS master_frame_url text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS provider_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_debug jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scene_blueprint jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locked_generation_prompt text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS last_error_details text;

-- Keep new alias columns populated for rows created before this migration.
UPDATE public.product_360_packages
SET provider = COALESCE(NULLIF(provider, ''), generation_provider, 'gemini')
WHERE provider IS NULL OR provider = '';

UPDATE public.product_360_packages
SET reference_image_path = COALESCE(reference_image_path, reference_image_storage_path)
WHERE reference_image_path IS NULL
  AND reference_image_storage_path IS NOT NULL;

-- Allow the requested lifecycle states.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.product_360_packages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    IF constraint_name IN (
      'product_360_packages_status_check',
      'p360_packages_status_check',
      'product_360_packages_generation_status_check'
    ) THEN
      EXECUTE format('ALTER TABLE public.product_360_packages DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END IF;
  END LOOP;
END;
$$;

UPDATE public.product_360_packages
SET status = 'draft'
WHERE status IS NULL
   OR status NOT IN (
    'draft', 'queued', 'planning', 'generating', 'processing',
    'paused_quota', 'ready', 'completed', 'failed', 'cancelled', 'archived'
  );

ALTER TABLE public.product_360_packages
  ADD CONSTRAINT product_360_packages_status_check
  CHECK (status IN (
    'draft', 'queued', 'planning', 'generating', 'processing',
    'paused_quota', 'ready', 'completed', 'failed', 'cancelled', 'archived'
  ));

-- Frames: provider/storage/prompt/error/consistency tracking.
ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS storage_status text,
  ADD COLUMN IF NOT EXISTS prompt_used text,
  ADD COLUMN IF NOT EXISTS angle_degrees integer,
  ADD COLUMN IF NOT EXISTS generation_attempt integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS error_type text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS needs_regeneration boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consistency_score numeric,
  ADD COLUMN IF NOT EXISTS provider_execution_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_error_message text,
  ADD COLUMN IF NOT EXISTS provider_error_details text;

UPDATE public.product_360_frames
SET generation_attempt = 1
WHERE generation_attempt IS NULL;

UPDATE public.product_360_frames
SET needs_regeneration = false
WHERE needs_regeneration IS NULL;

-- Ensure unique(package_id, frame_index).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_360_frames'::regclass
      AND conname = 'product_360_frames_package_id_frame_index_key'
  ) THEN
    ALTER TABLE public.product_360_frames
      ADD CONSTRAINT product_360_frames_package_id_frame_index_key
      UNIQUE (package_id, frame_index);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_product_360_packages_tenant_status
  ON public.product_360_packages (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_product_360_packages_product_status
  ON public.product_360_packages (product_id, status);

CREATE INDEX IF NOT EXISTS idx_product_360_frames_package_completed
  ON public.product_360_frames (package_id, frame_index)
  WHERE image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_360_frames_needs_regeneration
  ON public.product_360_frames (package_id, frame_index)
  WHERE needs_regeneration = true;

CREATE INDEX IF NOT EXISTS idx_product_360_frames_provider_execution
  ON public.product_360_frames (provider_execution_id)
  WHERE provider_execution_id IS NOT NULL;

-- Storage buckets. Public buckets are intentional so generated URLs can render in storefront viewers.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-360-frames', 'product-360-frames', true, 26214400, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
  ('product-360-references', 'product-360-references', true, 10485760, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Service role policies for both buckets. These are harmless if service role bypasses RLS,
-- but useful in projects that enforce storage policies consistently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'product_360_frames_service_role_all'
  ) THEN
    CREATE POLICY product_360_frames_service_role_all
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'product-360-frames')
      WITH CHECK (bucket_id = 'product-360-frames');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'product_360_references_service_role_all'
  ) THEN
    CREATE POLICY product_360_references_service_role_all
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'product-360-references')
      WITH CHECK (bucket_id = 'product-360-references');
  END IF;
END;
$$;

COMMIT;
