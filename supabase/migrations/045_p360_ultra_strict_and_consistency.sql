-- Migration 045: P360 Ultra Strict mode + consistency details
--
-- Adds:
--   1. 'ultra_strict' to consistency_mode check constraint on product_360_packages
--   2. consistency_details jsonb column on product_360_frames
--      (stores per-frame Gemini vision validation result: score, issues, driftDetails)
--   3. Ensures error_message column exists on product_360_frames
--   4. Sets default consistency_mode to 'ultra_strict' for new food packages
--
-- All changes are idempotent (IF NOT EXISTS / IF EXISTS / DROP THEN CREATE).
-- Does NOT break existing rows — only adds new optional columns.

BEGIN;

-- ── 1. Update consistency_mode check constraint to include 'ultra_strict' ────
--
-- Postgres does not support ALTER CONSTRAINT, so we must drop and recreate.
-- We first check if the constraint exists before dropping.
--
DO $$
BEGIN
  -- Drop old constraint (may be named from migration 037 or 043)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_360_packages_consistency_mode_check'
      AND conrelid = 'public.product_360_packages'::regclass
  ) THEN
    ALTER TABLE public.product_360_packages
      DROP CONSTRAINT product_360_packages_consistency_mode_check;
    RAISE NOTICE 'Dropped old consistency_mode check constraint.';
  END IF;
END;
$$;

-- Recreate with ultra_strict included
ALTER TABLE public.product_360_packages
  ADD CONSTRAINT product_360_packages_consistency_mode_check
    CHECK (consistency_mode IN ('standard', 'strict', 'ultra_strict'));

-- Update default to ultra_strict (new packages will default to strictest)
ALTER TABLE public.product_360_packages
  ALTER COLUMN consistency_mode SET DEFAULT 'ultra_strict';

-- Back-fill existing 'strict' packages to 'ultra_strict'
-- (conservative: only do this for packages that haven't started generating)
UPDATE public.product_360_packages
SET consistency_mode = 'ultra_strict'
WHERE consistency_mode = 'strict'
  AND status IN ('draft', 'queued');

-- consistency_mode constraint updated: standard | strict | ultra_strict

-- ── 2. Add consistency_details jsonb to product_360_frames ───────────────────
--
-- Stores the result of Gemini vision validation:
-- {
--   "score": 0.82,
--   "passed": true,
--   "issues": [],
--   "driftDetails": "",
--   "attempt": 1
-- }
--
ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS consistency_details  jsonb    DEFAULT NULL;

-- Add index for fast querying of failed frames
CREATE INDEX IF NOT EXISTS idx_p360_frames_consistency_score
  ON public.product_360_frames (consistency_score)
  WHERE consistency_score IS NOT NULL;

-- ── 3. Ensure error_message column exists on frames ──────────────────────────
ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS error_message  text  DEFAULT NULL;

-- ── 4. Ensure generation_attempt column exists ───────────────────────────────
ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS generation_attempt  int  DEFAULT 1;

-- ── 5. Ensure needs_regeneration column exists ───────────────────────────────
ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS needs_regeneration  boolean  DEFAULT false;

-- ── 6. Ensure consistency_score column exists ────────────────────────────────
ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS consistency_score  float  DEFAULT NULL;

-- ── 7. Ensure scene_blueprint default is safe ────────────────────────────────
ALTER TABLE public.product_360_packages
  ALTER COLUMN scene_blueprint SET DEFAULT '{}';

-- ── 8. Comments ──────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.product_360_packages.consistency_mode IS
  'standard = loose, strict = stronger prompts, ultra_strict = locked scene + validation + auto-regen';

COMMENT ON COLUMN public.product_360_frames.consistency_details IS
  'JSON result from Gemini vision validation: { score, passed, issues, driftDetails, attempt }';

COMMENT ON COLUMN public.product_360_frames.error_message IS
  'Human-readable error or consistency failure message for this specific frame';

COMMENT ON COLUMN public.product_360_frames.generation_attempt IS
  '1-based count of generation attempts for this frame (incremented on retry)';

COMMIT;
