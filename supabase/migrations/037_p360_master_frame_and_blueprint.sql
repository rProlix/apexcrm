-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 037 — 360 Package: master frame, scene blueprint, consistency fields
-- ─────────────────────────────────────────────────────────────────────────────
-- Supports the 3-stage locked generation pipeline:
--   Stage A  →  master_frame_url       canonical first-frame image URL
--   Stage B  →  scene_blueprint        frozen scene JSON spec
--            →  locked_generation_prompt  full text template stored on package
--   Stage C  →  per-frame consistency_score / generation_attempt columns
-- ─────────────────────────────────────────────────────────────────────────────

-- ── product_360_packages ─────────────────────────────────────────────────────

ALTER TABLE public.product_360_packages
  ADD COLUMN IF NOT EXISTS master_frame_url        text,
  ADD COLUMN IF NOT EXISTS scene_blueprint         jsonb    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locked_generation_prompt text,
  ADD COLUMN IF NOT EXISTS consistency_mode        text     NOT NULL DEFAULT 'strict',
  ADD COLUMN IF NOT EXISTS master_frame_generated  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at            timestamptz;

-- Consistency mode must be 'standard' or 'strict'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_360_packages_consistency_mode_check'
      AND conrelid = 'public.product_360_packages'::regclass
  ) THEN
    ALTER TABLE public.product_360_packages
      ADD CONSTRAINT product_360_packages_consistency_mode_check
        CHECK (consistency_mode IN ('standard', 'strict'));
  END IF;
END $$;

-- ── product_360_frames ────────────────────────────────────────────────────────

ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS angle_degrees       integer,
  ADD COLUMN IF NOT EXISTS generation_attempt  integer  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS needs_regeneration  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consistency_score   numeric  CHECK (consistency_score IS NULL OR (consistency_score >= 0 AND consistency_score <= 1)),
  ADD COLUMN IF NOT EXISTS is_master_frame     boolean  NOT NULL DEFAULT false;

-- Back-fill angle_degrees from frame_index where missing
-- (assumes clockwise orbit starting at 0°, evenly spaced)
-- This is a best-effort back-fill using the package's target_frame_count.
UPDATE public.product_360_frames f
SET    angle_degrees = ROUND(
         (f.frame_index::numeric / NULLIF(p.target_frame_count, 0)) * 360
       )::integer
FROM   public.product_360_packages p
WHERE  f.package_id = p.id
  AND  f.angle_degrees IS NULL;

-- Mark the 0-index frame as the master frame on every existing package
UPDATE public.product_360_frames
SET    is_master_frame = true
WHERE  frame_index = 0
  AND  is_master_frame = false;

-- Back-fill master_frame_url on packages that already have a 0-index frame
UPDATE public.product_360_packages pkg
SET    master_frame_url       = f.image_url,
       master_frame_generated = true
FROM   public.product_360_frames f
WHERE  f.package_id   = pkg.id
  AND  f.frame_index  = 0
  AND  f.image_url    IS NOT NULL
  AND  pkg.master_frame_url IS NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_p360_packages_master_frame_url
  ON public.product_360_packages (master_frame_url)
  WHERE master_frame_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_p360_frames_is_master
  ON public.product_360_frames (package_id, is_master_frame)
  WHERE is_master_frame = true;

CREATE INDEX IF NOT EXISTS idx_p360_frames_needs_regen
  ON public.product_360_frames (package_id, needs_regeneration)
  WHERE needs_regeneration = true;

-- ── RLS (product_360_packages already has RLS enabled in migration 027) ───────
-- New columns inherit the existing RLS policies automatically.
-- No new policies required.

COMMENT ON COLUMN public.product_360_packages.master_frame_url IS
  'URL of the canonical first frame (0°). All subsequent frames use this as a visual anchor.';

COMMENT ON COLUMN public.product_360_packages.scene_blueprint IS
  'Frozen scene JSON: subject, camera, lighting, background, consistencyRules. '
  'Built from product + preset at generation start and never mutated during generation.';

COMMENT ON COLUMN public.product_360_packages.locked_generation_prompt IS
  'The verbatim text template describing the frozen studio scene. '
  'Injected into every Stage-C (locked frame) prompt verbatim.';

COMMENT ON COLUMN public.product_360_packages.consistency_mode IS
  'standard = moderate locking, strict = maximum locking (default).';

COMMENT ON COLUMN public.product_360_packages.master_frame_generated IS
  'True once the master frame (frame 0) has been successfully generated and uploaded.';

COMMENT ON COLUMN public.product_360_frames.angle_degrees IS
  'Camera orbit angle in degrees (0–359). 0 = front, increases clockwise.';

COMMENT ON COLUMN public.product_360_frames.is_master_frame IS
  'True for frame_index = 0. This frame is the canonical visual reference.';

COMMENT ON COLUMN public.product_360_frames.generation_attempt IS
  'How many times this frame was generated. 1 = first attempt.';

COMMENT ON COLUMN public.product_360_frames.needs_regeneration IS
  'True if consistency checks flagged this frame as too different from the master.';

COMMENT ON COLUMN public.product_360_frames.consistency_score IS
  'Optional 0–1 score from post-processing consistency checks (1 = perfect match to master).';
