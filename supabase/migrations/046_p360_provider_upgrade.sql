-- Migration 046: P360 provider upgrade
--
-- Adds multi-provider support (Gemini/Imagen + Leonardo AI) to the 360 Product Studio.
-- All changes are fully idempotent (IF NOT EXISTS / IF EXISTS).
-- Does NOT destroy existing rows or break existing constraints.

BEGIN;

-- ── 1. product_360_packages: new provider + reference image columns ───────────

ALTER TABLE public.product_360_packages
  ADD COLUMN IF NOT EXISTS reference_image_url             text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reference_image_storage_path    text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reference_image_required        boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS leonardo_blueprint_version_id   text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS leonardo_execution_id           text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_job_id                 text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_status                 text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_response               jsonb         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS locked_identity_blueprint       jsonb         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consistency_seed                text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS angle_strategy                  text          DEFAULT 'orbit_locked',
  ADD COLUMN IF NOT EXISTS provider_settings               jsonb         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_stage                text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_provider_error             text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_provider_error_details     text          DEFAULT NULL;

-- ── 2. generation_provider: ensure column exists + update constraint ──────────
--
-- The column may already exist from an earlier migration (043 adds it with default 'gemini').
-- IMPORTANT: back-fill any NULL / unrecognised values to 'gemini' BEFORE adding the check
-- constraint, otherwise rows with NULL or legacy values will violate the new constraint.
--
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'product_360_packages'
      AND column_name  = 'generation_provider'
  ) THEN
    ALTER TABLE public.product_360_packages
      ADD COLUMN generation_provider text DEFAULT 'gemini';
  END IF;
END;
$$;

-- Back-fill ALL rows that are NULL or not one of the accepted values BEFORE the constraint
UPDATE public.product_360_packages
SET generation_provider = 'gemini'
WHERE generation_provider IS NULL
   OR generation_provider NOT IN ('gemini', 'leonardo');

-- Drop old generation_provider check constraint if present, then recreate
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'product_360_packages_generation_provider_check'
      AND conrelid  = 'public.product_360_packages'::regclass
  ) THEN
    ALTER TABLE public.product_360_packages
      DROP CONSTRAINT product_360_packages_generation_provider_check;
  END IF;
END;
$$;

ALTER TABLE public.product_360_packages
  ADD CONSTRAINT product_360_packages_generation_provider_check
    CHECK (generation_provider IN ('gemini', 'leonardo'));

-- ── 3. angle_strategy: back-fill then constrain ───────────────────────────────

-- Back-fill any NULL or unrecognised angle_strategy values before the constraint
UPDATE public.product_360_packages
SET angle_strategy = 'orbit_locked'
WHERE angle_strategy IS NULL
   OR angle_strategy NOT IN ('orbit_locked', 'turntable', 'camera_orbit', 'reference_image_orbit');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'product_360_packages_angle_strategy_check'
      AND conrelid  = 'public.product_360_packages'::regclass
  ) THEN
    ALTER TABLE public.product_360_packages
      DROP CONSTRAINT product_360_packages_angle_strategy_check;
  END IF;
END;
$$;

ALTER TABLE public.product_360_packages
  ADD CONSTRAINT product_360_packages_angle_strategy_check
    CHECK (angle_strategy IN ('orbit_locked', 'turntable', 'camera_orbit', 'reference_image_orbit'));

-- ── 4. generation_stage: back-fill then constrain ────────────────────────────

-- Null out any unrecognised generation_stage values so they pass the IS NULL branch
UPDATE public.product_360_packages
SET generation_stage = NULL
WHERE generation_stage IS NOT NULL
  AND generation_stage NOT IN (
    'draft', 'queued', 'planning', 'master_reference', 'generating',
    'polling_provider', 'downloading', 'uploading', 'processing',
    'ready', 'completed', 'failed', 'cancelled', 'paused_quota', 'archived'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'product_360_packages_generation_stage_check'
      AND conrelid  = 'public.product_360_packages'::regclass
  ) THEN
    ALTER TABLE public.product_360_packages
      DROP CONSTRAINT product_360_packages_generation_stage_check;
  END IF;
END;
$$;

ALTER TABLE public.product_360_packages
  ADD CONSTRAINT product_360_packages_generation_stage_check
    CHECK (generation_stage IS NULL OR generation_stage IN (
      'draft', 'queued', 'planning', 'master_reference', 'generating',
      'polling_provider', 'downloading', 'uploading', 'processing',
      'ready', 'completed', 'failed', 'cancelled', 'paused_quota', 'archived'
    ));

-- ── 5. product_360_frames: add per-frame provider job tracking ────────────────

ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS provider_job_id       text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_status       text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_response     jsonb   DEFAULT NULL;

-- Index for fast lookup of frames still polling a provider job
CREATE INDEX IF NOT EXISTS idx_p360_frames_provider_job_id
  ON public.product_360_frames (provider_job_id)
  WHERE provider_job_id IS NOT NULL;

-- ── 6. Comments ───────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.product_360_packages.generation_provider IS
  'AI provider: gemini (Imagen) or leonardo (Blueprint Executions)';

COMMENT ON COLUMN public.product_360_packages.reference_image_url IS
  'Public URL of the owner-uploaded product reference image (used as visual anchor)';

COMMENT ON COLUMN public.product_360_packages.reference_image_storage_path IS
  'Supabase Storage path for the reference image (spin-360-assets bucket)';

COMMENT ON COLUMN public.product_360_packages.reference_image_required IS
  'When true, generation will refuse to start without a reference image uploaded';

COMMENT ON COLUMN public.product_360_packages.locked_identity_blueprint IS
  'Locked scene identity JSON: subject/vessel/scene/rotation/negativeRules';

COMMENT ON COLUMN public.product_360_packages.angle_strategy IS
  'How orbit angles are computed: orbit_locked, turntable, camera_orbit, reference_image_orbit';

COMMENT ON COLUMN public.product_360_packages.generation_stage IS
  'Fine-grained internal stage for the current/last generation run';

COMMENT ON COLUMN public.product_360_packages.provider_job_id IS
  'External job/execution ID from the AI provider (e.g. Leonardo blueprintExecutionJob.id)';

COMMENT ON COLUMN public.product_360_packages.last_provider_error IS
  'Short error label from the last provider failure (displayed in UI)';

COMMENT ON COLUMN public.product_360_packages.last_provider_error_details IS
  'Full error details / JSON response from the last provider failure';

COMMENT ON COLUMN public.product_360_frames.provider_job_id IS
  'External execution ID for this specific frame (used to resume async provider polling)';

COMMIT;
