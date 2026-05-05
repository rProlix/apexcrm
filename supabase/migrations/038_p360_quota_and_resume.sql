-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 038 — 360 Package: quota-safe generation states + error tracking
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds:
--   • paused_quota / cancelled / planning status values
--   • last_error_type, last_error_at, next_retry_at, retry_count columns
--   • product_360_frames: error_type column
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extend the status check constraint ───────────────────────────────────────
-- Find and drop the existing status CHECK on product_360_packages, then re-add
-- with the expanded set.  We use DO $$ to make this idempotent.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.product_360_packages'::regclass
     AND conname LIKE '%status%'
   LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_360_packages DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE public.product_360_packages
  ADD CONSTRAINT product_360_packages_status_check
    CHECK (status IN (
      'draft',
      'queued',
      'planning',
      'generating',
      'processing',
      'paused_quota',
      'ready',
      'completed',
      'failed',
      'cancelled',
      'archived'
    ));

-- ── Error tracking columns ────────────────────────────────────────────────────
-- These are written when generation is paused or fails so the UI can show
-- a clear explanation and the backend can decide whether to retry.

ALTER TABLE public.product_360_packages
  ADD COLUMN IF NOT EXISTS last_error_type    text,
  ADD COLUMN IF NOT EXISTS last_error_at      timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at      timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count        integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS generation_completed_at timestamptz;

-- Constraint on last_error_type so only known values can be stored
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_360_packages_last_error_type_check'
      AND conrelid = 'public.product_360_packages'::regclass
  ) THEN
    ALTER TABLE public.product_360_packages
      ADD CONSTRAINT product_360_packages_last_error_type_check
        CHECK (last_error_type IN (
          'quota_exceeded',
          'invalid_request',
          'auth_error',
          'billing_or_permission',
          'provider_unavailable',
          'unknown'
        ) OR last_error_type IS NULL);
  END IF;
END $$;

-- ── product_360_frames: error tracking ───────────────────────────────────────

ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS error_type    text,
  ADD COLUMN IF NOT EXISTS error_message text;

-- ── product_360_frames: ensure unique(package_id, frame_index) exists ─────────
-- The upsert in generationService requires this. Create it idempotently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_360_frames_package_id_frame_index_key'
      AND conrelid = 'public.product_360_frames'::regclass
  ) THEN
    ALTER TABLE public.product_360_frames
      ADD CONSTRAINT product_360_frames_package_id_frame_index_key
        UNIQUE (package_id, frame_index);
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_p360_packages_paused_quota
  ON public.product_360_packages (tenant_id, status)
  WHERE status = 'paused_quota';

CREATE INDEX IF NOT EXISTS idx_p360_packages_next_retry
  ON public.product_360_packages (next_retry_at)
  WHERE next_retry_at IS NOT NULL AND status = 'paused_quota';

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.product_360_packages.last_error_type IS
  'Normalized error type from the last failed generation attempt.';

COMMENT ON COLUMN public.product_360_packages.last_error_at IS
  'Timestamp of the last error that paused or failed this package.';

COMMENT ON COLUMN public.product_360_packages.next_retry_at IS
  'Earliest time this package can be retried (from provider Retry-After). NULL = no scheduled retry.';

COMMENT ON COLUMN public.product_360_packages.retry_count IS
  'Number of times generation has been resumed after a pause/failure.';
