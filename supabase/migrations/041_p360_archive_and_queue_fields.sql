-- ============================================================
-- Migration 041: 360 Product Studio — Archive metadata + Frame status
-- ============================================================
-- product_360_packages:
--   archived_at    — when the package was soft-archived
--   archived_by    — user who archived it
--   archive_reason — optional note
--   queue_position — ordering hint within the tenant queue
--   queued_at      — when the package entered queued status
--
-- product_360_frames:
--   status         — per-frame lifecycle (pending/queued/generating/completed/
--                    failed/cancelled/skipped/archived)
--   archived_at    — when this frame was archived
--   queue_position — position within the package generation queue
--   queued_at      — when the frame was queued for generation
--   generation_started_at  — start of this frame's Imagen call
--   generation_finished_at — end of this frame's Imagen call
--
-- All statements are idempotent.
-- ============================================================

-- ─── product_360_packages: archive + queue columns ───────────────────────────

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS archived_at    timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by    uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS queue_position integer,
  ADD COLUMN IF NOT EXISTS queued_at      timestamptz;

-- ─── product_360_frames: status column ───────────────────────────────────────

ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS status                  text,
  ADD COLUMN IF NOT EXISTS archived_at             timestamptz,
  ADD COLUMN IF NOT EXISTS queue_position          integer,
  ADD COLUMN IF NOT EXISTS queued_at               timestamptz,
  ADD COLUMN IF NOT EXISTS generation_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS generation_finished_at  timestamptz;

-- Back-fill frame status from image_url presence (existing rows are complete)
UPDATE product_360_frames
SET status = CASE WHEN image_url IS NOT NULL THEN 'completed' ELSE 'pending' END
WHERE status IS NULL;

-- Now make NOT NULL with a safe default
ALTER TABLE product_360_frames
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE product_360_frames
  ALTER COLUMN status SET NOT NULL;

-- Frame status CHECK constraint
ALTER TABLE product_360_frames
  DROP CONSTRAINT IF EXISTS p360_frames_status_check;

ALTER TABLE product_360_frames
  ADD CONSTRAINT p360_frames_status_check
    CHECK (status IN (
      'pending', 'queued', 'generating',
      'completed', 'failed', 'cancelled', 'skipped', 'archived'
    ));

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS p360_frames_status_idx
  ON product_360_frames (package_id, status);

CREATE INDEX IF NOT EXISTS p360_pkg_queued_at_idx
  ON product_360_packages (tenant_id, queued_at)
  WHERE queued_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS p360_pkg_archived_at_idx
  ON product_360_packages (tenant_id, archived_at)
  WHERE archived_at IS NOT NULL;
