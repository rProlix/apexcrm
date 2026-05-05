-- ============================================================
-- Migration 040: 360 Product Studio — Cancel Generation support
-- ============================================================
-- Adds columns required for the Stop Generation / Cancel feature:
--
--   product_360_packages:
--     cancel_requested     — DB flag polled by the generation loop
--     cancel_requested_at  — when the cancel was first requested
--     cancelled_at         — when the package was officially cancelled
--     last_error_message   — human-readable error for the last failure
--     last_error_details   — raw/technical error detail (DB/API error text)
--
-- Also ensures:
--   • The package status CHECK constraint allows every status in P360Status.
--   • Useful indexes exist for the generation loop and polling queries.
--
-- Idempotent: every statement uses IF NOT EXISTS / IF EXISTS guards.
-- ============================================================

-- ─── product_360_packages: cancel columns ────────────────────────────────────

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS cancel_requested     boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_message   text,
  ADD COLUMN IF NOT EXISTS last_error_details   text;

-- ─── Status check constraint ─────────────────────────────────────────────────
-- Re-create with the full set of allowed status values so future migrations
-- don't have to worry about partial lists.  This is safe: the new list is a
-- superset of every value that could legitimately exist in any live row.

-- Normalize any rows that might have a non-standard status value before
-- applying a strict constraint (defensive for partial migration scenarios).
UPDATE product_360_packages
SET status = 'draft'
WHERE status IS NULL
   OR status NOT IN (
     'draft', 'queued', 'planning', 'generating', 'processing',
     'paused_quota', 'ready', 'completed', 'failed', 'cancelled', 'archived'
   );

ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_status_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_status_check
    CHECK (status IN (
      'draft', 'queued', 'planning', 'generating', 'processing',
      'paused_quota', 'ready', 'completed', 'failed', 'cancelled', 'archived'
    ));

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Fast lookup for the cancel-check query inside the generation loop
CREATE INDEX IF NOT EXISTS p360_pkg_cancel_requested_idx
  ON product_360_packages (id, cancel_requested)
  WHERE cancel_requested = true;

-- General tenant + status index (used by listPackages, generation-status polling)
CREATE INDEX IF NOT EXISTS p360_pkg_tenant_status_idx
  ON product_360_packages (tenant_id, status);

-- Per-product listing (used by the product browser)
CREATE INDEX IF NOT EXISTS p360_pkg_product_id_idx
  ON product_360_packages (product_id);

-- product_360_frames indexes used during generation and status polling
CREATE INDEX IF NOT EXISTS p360_frames_package_id_idx
  ON product_360_frames (package_id);

CREATE INDEX IF NOT EXISTS p360_frames_package_frame_idx
  ON product_360_frames (package_id, frame_index);
