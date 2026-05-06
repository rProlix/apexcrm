-- ============================================================
-- Migration 042: 360 Generation — tracking columns + jobs table
-- ============================================================
-- product_360_frames:
--   retry_count        — number of generation retries for this frame
--   updated_at         — last-modified timestamp (auto-updated)
--
-- product_360_packages:
--   last_generation_heartbeat — written every few frames so stale detection works
--   planner_model             — model used for Gemini planning (if not already added)
--
-- product_360_generation_jobs table:
--   Created if not exists. Tracks individual generation runs. Silently skipped
--   if the table already exists (all statements are idempotent).
--
-- All statements use IF NOT EXISTS / DO $$ guards — safe to re-run.
-- ============================================================

-- ─── product_360_frames: retry + updated_at ───────────────────────────────────

ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS retry_count  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz;

-- Back-fill updated_at from created_at for existing rows
UPDATE product_360_frames
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Make NOT NULL with automatic default going forward
ALTER TABLE product_360_frames
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE product_360_frames
  ALTER COLUMN updated_at SET NOT NULL;

-- ─── product_360_packages: heartbeat + planner_model ─────────────────────────

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS last_generation_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS planner_model             text;

-- ─── product_360_generation_jobs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_360_generation_jobs (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          uuid        NOT NULL,
  package_id         uuid        NOT NULL REFERENCES product_360_packages (id) ON DELETE CASCADE,
  product_id         uuid,
  requested_by       uuid,
  provider           text        NOT NULL DEFAULT 'imagen',
  ai_model           text,
  status             text        NOT NULL DEFAULT 'running'
                      CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  prompt             text,
  target_frame_count integer     NOT NULL DEFAULT 0,
  frames_completed   integer     NOT NULL DEFAULT 0,
  error_message      text,
  raw_response       jsonb                DEFAULT '{}',
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Tenant-scoped index for listing jobs
CREATE INDEX IF NOT EXISTS p360_jobs_tenant_package_idx
  ON product_360_generation_jobs (tenant_id, package_id, created_at DESC);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS p360_frames_status_pkg_idx
  ON product_360_frames (package_id, status, frame_index);

CREATE INDEX IF NOT EXISTS p360_frames_updated_at_idx
  ON product_360_frames (package_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS p360_pkg_heartbeat_idx
  ON product_360_packages (tenant_id, last_generation_heartbeat)
  WHERE last_generation_heartbeat IS NOT NULL;
