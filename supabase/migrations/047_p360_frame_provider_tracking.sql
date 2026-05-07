-- Migration 047: P360 frame provider tracking columns
--
-- Adds per-frame provider name, execution id alias, and error detail columns.
-- Migration 046 already added provider_job_id / provider_status / provider_response.
-- This migration completes the tracking schema for async provider workflows.
--
-- Idempotent (IF NOT EXISTS throughout).

BEGIN;

ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS provider               text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_execution_id  text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_error_message text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_error_details text    DEFAULT NULL;

-- Back-fill provider_execution_id from provider_job_id for existing rows
UPDATE public.product_360_frames
SET provider_execution_id = provider_job_id
WHERE provider_execution_id IS NULL
  AND provider_job_id IS NOT NULL;

-- Constrain provider_status to known values (NULL allowed for non-async providers)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'product_360_frames_provider_status_check'
      AND conrelid  = 'public.product_360_frames'::regclass
  ) THEN
    ALTER TABLE public.product_360_frames
      DROP CONSTRAINT product_360_frames_provider_status_check;
  END IF;
END;
$$;

-- Normalize any out-of-range values first
UPDATE public.product_360_frames
SET provider_status = NULL
WHERE provider_status IS NOT NULL
  AND provider_status NOT IN ('pending', 'processing', 'completed', 'failed');

ALTER TABLE public.product_360_frames
  ADD CONSTRAINT product_360_frames_provider_status_check
    CHECK (provider_status IS NULL OR provider_status IN ('pending', 'processing', 'completed', 'failed'));

-- Composite index: quickly find frames with pending provider work
CREATE INDEX IF NOT EXISTS idx_p360_frames_pkg_provider_status
  ON public.product_360_frames (package_id, provider_status)
  WHERE provider_status IN ('pending', 'processing');

-- Index for resuming by execution id
CREATE INDEX IF NOT EXISTS idx_p360_frames_provider_execution_id
  ON public.product_360_frames (provider_execution_id)
  WHERE provider_execution_id IS NOT NULL;

COMMENT ON COLUMN public.product_360_frames.provider IS
  'Which AI provider generated this frame (gemini | leonardo)';
COMMENT ON COLUMN public.product_360_frames.provider_execution_id IS
  'Leonardo Blueprint Execution ID (or other async provider job ID) for this frame';
COMMENT ON COLUMN public.product_360_frames.provider_error_message IS
  'Short, user-facing error from the provider for this frame';
COMMENT ON COLUMN public.product_360_frames.provider_error_details IS
  'Sanitized diagnostic details (response keys, status, no secrets)';

COMMIT;
