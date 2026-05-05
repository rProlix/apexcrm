-- ============================================================
-- Migration 035: product_360 progress-tracking columns
-- ============================================================
-- Adds:
--   frames_done        — actual DB frame rows generated so far
--   progress_percent   — 0-100, updated per-frame during generation
--   preview_image_url  — canonical preview thumbnail (middle frame)
--   last_generated_at  — timestamp of last successful generation
-- Extends the status CHECK constraint with 'processing'.
-- Backfills existing ready packages.
-- ============================================================

-- ── New columns ──────────────────────────────────────────────────────────────
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS frames_done        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_percent   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_image_url  text,
  ADD COLUMN IF NOT EXISTS last_generated_at  timestamptz;

-- ── Extend status constraint to include 'processing' ─────────────────────────
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_status_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_status_check
    CHECK (status IN (
      'draft',
      'queued',
      'generating',
      'processing',
      'ready',
      'failed',
      'archived'
    ));

-- ── Backfill existing ready packages ─────────────────────────────────────────
UPDATE product_360_packages
SET
  frames_done      = frame_count,
  progress_percent = 100
WHERE status = 'ready'
  AND frame_count > 0
  AND frames_done = 0;

-- Copy existing cover_frame_url into preview_image_url for ready packages
UPDATE product_360_packages
SET preview_image_url = cover_frame_url
WHERE preview_image_url IS NULL
  AND cover_frame_url  IS NOT NULL;

-- ── Index: efficiently find stuck packages ────────────────────────────────────
CREATE INDEX IF NOT EXISTS p360_pkg_stuck_idx
  ON product_360_packages (tenant_id, status, updated_at)
  WHERE status IN ('queued', 'generating', 'processing');
