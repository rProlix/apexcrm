-- ============================================================
-- Migration 043: 360 Product Studio — Full repair & normalize
-- ============================================================
-- Root-cause fixes for packages stuck in queued/generating:
--
--   1. Belt-and-suspenders ADD COLUMN IF NOT EXISTS for every column
--      referenced by generationService.ts so that the "status='generating'"
--      DB update never fails silently and leaves the package in 'queued'.
--
--   2. Drop ALL conflicting status CHECK constraints and replace with
--      a single canonical list for packages and frames.
--
--   3. Normalize any rogue status values in existing rows.
--
--   4. Reset packages that have been stuck in queued/generating/processing
--      for over 30 minutes (Vercel function timeout / crash).
--
--   5. Clear stale cancel_requested flags on non-cancelled packages.
--
--   6. Recalculate frames_done / progress_percent from actual frame rows.
--
--   7. Ensure unique(package_id, frame_index) constraint for upsert safety.
--
--   8. Ensure product_360_generation_jobs table exists.
--
-- All statements are idempotent.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Add missing columns to product_360_packages
-- ─────────────────────────────────────────────────────────────────────────────
-- Uses ADD COLUMN IF NOT EXISTS so existing columns are untouched.
-- This fixes the silent failure in generationService.ts where a single
-- db.update() with extended metadata columns returns { error } (ignored by code)
-- and leaves the package in 'queued' indefinitely.

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS generation_error           text,
  ADD COLUMN IF NOT EXISTS last_error_type            text,
  ADD COLUMN IF NOT EXISTS last_error_at              timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_message         text,
  ADD COLUMN IF NOT EXISTS last_error_details         text,
  ADD COLUMN IF NOT EXISTS next_retry_at              timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count                integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_requested           boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at               timestamptz,
  ADD COLUMN IF NOT EXISTS generation_started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS generation_completed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS frames_done                integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_percent           integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_image_url          text,
  ADD COLUMN IF NOT EXISTS last_generated_at          timestamptz,
  ADD COLUMN IF NOT EXISTS last_generation_heartbeat  timestamptz,
  ADD COLUMN IF NOT EXISTS master_frame_url           text,
  ADD COLUMN IF NOT EXISTS master_frame_generated     boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scene_blueprint            jsonb                 DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locked_generation_prompt   text,
  ADD COLUMN IF NOT EXISTS consistency_mode           text         NOT NULL DEFAULT 'strict',
  ADD COLUMN IF NOT EXISTS planner_model              text,
  ADD COLUMN IF NOT EXISTS ai_model                   text,
  ADD COLUMN IF NOT EXISTS archived_at                timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by                uuid,
  ADD COLUMN IF NOT EXISTS archive_reason             text,
  ADD COLUMN IF NOT EXISTS queue_position             integer,
  ADD COLUMN IF NOT EXISTS queued_at                  timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Add missing columns to product_360_frames
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS error_type              text,
  ADD COLUMN IF NOT EXISTS error_message           text,
  ADD COLUMN IF NOT EXISTS provider_request_id     text,
  ADD COLUMN IF NOT EXISTS generation_attempt      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retry_count             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_regeneration      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_master_frame         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS generation_finished_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at             timestamptz,
  ADD COLUMN IF NOT EXISTS queue_position          integer,
  ADD COLUMN IF NOT EXISTS queued_at               timestamptz;

-- Back-fill updated_at from created_at if still NULL
ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE product_360_frames
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE product_360_frames
  ALTER COLUMN updated_at SET DEFAULT now();

-- Ensure status column exists with correct default and NOT NULL
ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Drop ALL conflicting status constraints and add canonical ones
-- ─────────────────────────────────────────────────────────────────────────────

-- Packages: drop every constraint whose name matches *status*
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.product_360_packages'::regclass
       AND conname LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.product_360_packages DROP CONSTRAINT IF EXISTS '
            || quote_ident(r.conname);
  END LOOP;
END $$;

-- Frames: drop every constraint whose name matches *status*
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.product_360_frames'::regclass
       AND conname LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.product_360_frames DROP CONSTRAINT IF EXISTS '
            || quote_ident(r.conname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Normalize rogue status values before adding strict constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- Packages
UPDATE product_360_packages
SET
  status             = 'failed',
  last_error_message = COALESCE(
    last_error_message,
    'Status "' || status || '" is not a valid package status — normalized by migration 043.'
  ),
  updated_at         = now()
WHERE status IS NULL
   OR status NOT IN (
      'draft', 'queued', 'planning', 'generating', 'processing',
      'paused_quota', 'ready', 'completed', 'failed', 'cancelled', 'archived'
   );

-- Frames: map legacy values
UPDATE product_360_frames SET status = 'completed' WHERE status = 'ready';
UPDATE product_360_frames SET status = 'cancelled'  WHERE status = 'canceled';

UPDATE product_360_frames
SET status = 'failed'
WHERE status NOT IN (
  'pending', 'queued', 'generating', 'completed', 'failed', 'cancelled', 'skipped', 'archived'
);

-- Back-fill NULL frame statuses from image_url
UPDATE product_360_frames
SET status = CASE WHEN image_url IS NOT NULL THEN 'completed' ELSE 'pending' END
WHERE status IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 — Add canonical status constraints
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_status_check
    CHECK (status IN (
      'draft', 'queued', 'planning', 'generating', 'processing',
      'paused_quota', 'ready', 'completed', 'failed', 'cancelled', 'archived'
    ));

ALTER TABLE product_360_frames
  ADD CONSTRAINT p360_frames_status_check
    CHECK (status IN (
      'pending', 'queued', 'generating',
      'completed', 'failed', 'cancelled', 'skipped', 'archived'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 — Reset packages stuck in active generation for > 30 minutes
-- ─────────────────────────────────────────────────────────────────────────────
-- Vercel functions max out at 300 s (5 min) even on Pro plans.
-- Any package still in queued/generating/processing after 30 min is definitely
-- stuck — the Vercel function died or timed out.

UPDATE product_360_packages
SET
  status             = 'failed',
  last_error_message = 'Vercel function timeout — generation was interrupted. '
                    || 'The package has been reset. Click Retry to resume from '
                    || 'the last completed frame.',
  generation_error   = 'Vercel function timeout after '
                    || EXTRACT(EPOCH FROM (now() - updated_at))::integer
                    || ' seconds.',
  updated_at         = now()
WHERE status IN ('queued', 'generating', 'processing')
  AND updated_at < now() - interval '30 minutes';

-- Reset stuck 'generating' frames so pump/generate can pick them up again
UPDATE product_360_frames
SET
  status     = 'pending',
  updated_at = now()
WHERE status = 'generating'
  AND package_id IN (
    SELECT id
    FROM   product_360_packages
    WHERE  last_error_message LIKE 'Vercel function timeout%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7 — Clear stale cancel_requested on non-cancelled packages
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE product_360_packages
SET
  cancel_requested    = false,
  cancel_requested_at = null,
  updated_at          = now()
WHERE cancel_requested = true
  AND status NOT IN ('cancelled', 'generating', 'processing', 'queued', 'planning');

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8 — Recalculate frames_done + progress_percent from actual frame rows
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE product_360_packages p
SET
  frames_done       = sub.completed_count,
  progress_percent  = CASE
    WHEN p.target_frame_count > 0
    THEN LEAST(100, ROUND((sub.completed_count::numeric / p.target_frame_count) * 100))
    ELSE 0
  END
FROM (
  SELECT   package_id,
           COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS completed_count
  FROM     product_360_frames
  GROUP BY package_id
) sub
WHERE p.id = sub.package_id
  AND p.status NOT IN ('draft', 'archived');

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9 — Ensure unique(package_id, frame_index) for upsert safety
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname    = 'product_360_frames_package_id_frame_index_key'
      AND  conrelid   = 'public.product_360_frames'::regclass
  ) THEN
    ALTER TABLE product_360_frames
      ADD CONSTRAINT product_360_frames_package_id_frame_index_key
        UNIQUE (package_id, frame_index);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10 — Ensure product_360_generation_jobs table exists
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_360_generation_jobs (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid        NOT NULL,
  package_id          uuid        NOT NULL REFERENCES product_360_packages (id) ON DELETE CASCADE,
  product_id          uuid,
  requested_by        uuid,
  provider            text        NOT NULL DEFAULT 'imagen',
  ai_model            text,
  status              text        NOT NULL DEFAULT 'running'
                        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  prompt              text,
  target_frame_count  integer     NOT NULL DEFAULT 0,
  frames_completed    integer     NOT NULL DEFAULT 0,
  error_message       text,
  raw_response        jsonb                DEFAULT '{}'::jsonb,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11 — Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS p360_pkg_tenant_status_idx
  ON product_360_packages (tenant_id, status);

CREATE INDEX IF NOT EXISTS p360_pkg_product_status_idx
  ON product_360_packages (product_id, status);

CREATE INDEX IF NOT EXISTS p360_pkg_cancel_requested_idx
  ON product_360_packages (id, cancel_requested)
  WHERE cancel_requested = true;

CREATE INDEX IF NOT EXISTS p360_pkg_heartbeat_idx
  ON product_360_packages (tenant_id, last_generation_heartbeat)
  WHERE last_generation_heartbeat IS NOT NULL;

CREATE INDEX IF NOT EXISTS p360_pkg_queued_at_idx
  ON product_360_packages (tenant_id, queued_at)
  WHERE queued_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS p360_pkg_archived_at_idx
  ON product_360_packages (tenant_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS p360_frames_package_id_idx
  ON product_360_frames (package_id);

CREATE INDEX IF NOT EXISTS p360_frames_package_frame_idx
  ON product_360_frames (package_id, frame_index);

CREATE INDEX IF NOT EXISTS p360_frames_status_idx
  ON product_360_frames (package_id, status);

CREATE INDEX IF NOT EXISTS p360_frames_status_pkg_idx
  ON product_360_frames (package_id, status, frame_index);

CREATE INDEX IF NOT EXISTS p360_frames_updated_at_idx
  ON product_360_frames (package_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS p360_jobs_tenant_package_idx
  ON product_360_generation_jobs (tenant_id, package_id, created_at DESC);
