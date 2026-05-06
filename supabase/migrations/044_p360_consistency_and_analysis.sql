-- 044_p360_consistency_and_analysis.sql
-- Adds vision-analysis tracking and consistency fields to the 360 Product Studio tables.
--
-- New columns on product_360_packages:
--   analysis_version     INT  — 1=text-only blueprint, 2=vision-grounded (Gemini analyzed master frame)
--   master_frame_analysis JSONB — exact details extracted by Gemini vision from the master frame
--
-- New columns on product_360_frames:
--   generation_attempt   INT  — how many times this frame was attempted (1=first, 2=retry, …)
--   consistency_score    FLOAT — optional 0-1 score (1=perfect, 0=bad); null until validated
--
-- All additions are safe/idempotent: DO NOTHING on conflict, IF NOT EXISTS guards.
-- Existing rows get sensible defaults.

-- ─── product_360_packages additions ──────────────────────────────────────────

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS analysis_version     INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS master_frame_analysis JSONB   DEFAULT NULL;

COMMENT ON COLUMN product_360_packages.analysis_version IS
  '1 = text-only blueprint from product description; 2 = vision-grounded from Gemini master frame analysis';

COMMENT ON COLUMN product_360_packages.master_frame_analysis IS
  'Exact scene details extracted by Gemini vision from the generated master frame. Injected into all subsequent frame prompts for maximum consistency.';

-- ─── product_360_frames additions ─────────────────────────────────────────────

ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS generation_attempt  INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS consistency_score   FLOAT   DEFAULT NULL;

COMMENT ON COLUMN product_360_frames.generation_attempt IS
  'Number of generation attempts for this frame. 1 = succeeded on first try; higher = retries were needed.';

COMMENT ON COLUMN product_360_frames.consistency_score IS
  'Optional 0-1 consistency score. 1.0 = perfectly consistent with master. null = not yet validated.';

-- ─── Indexes ───────────────────────────────────────────────────────────────────

-- Index for filtering frames that need regeneration (consistency check failed)
CREATE INDEX IF NOT EXISTS idx_p360_frames_needs_regen
  ON product_360_frames (package_id, needs_regeneration)
  WHERE needs_regeneration = true;

-- Index for looking up frames by generation attempt count
CREATE INDEX IF NOT EXISTS idx_p360_frames_generation_attempt
  ON product_360_frames (package_id, generation_attempt)
  WHERE generation_attempt > 1;

-- ─── Backfill defaults ────────────────────────────────────────────────────────

-- Set analysis_version = 2 for packages that already have master_frame_analysis
-- (in case this migration is applied after some have already been analyzed)
UPDATE product_360_packages
  SET analysis_version = 2
  WHERE master_frame_analysis IS NOT NULL
    AND analysis_version < 2;

-- Set generation_attempt = 1 for any existing completed frames that have no value
UPDATE product_360_frames
  SET generation_attempt = 1
  WHERE generation_attempt IS NULL OR generation_attempt < 1;
