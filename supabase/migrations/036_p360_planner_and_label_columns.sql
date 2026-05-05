-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 036: 360 Product Studio — planner model, labels, prompt tracking
-- ──────────────────────────────────────────────────────────────────────────────
-- Adds columns needed for the two-phase generation pipeline (Gemini planning +
-- Imagen rendering), package labels, and proper completion timestamps.
-- Safe to run multiple times (idempotent via ADD COLUMN IF NOT EXISTS).
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── product_360_packages: new tracking columns ───────────────────────────────

-- Which Gemini text model was used for planning
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS planner_model text;

-- Human-readable label for UI display (Default, Limited Time Promo, etc.)
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS label text;

-- When the package fully completed generation
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill completed_at for existing ready packages
UPDATE product_360_packages
SET completed_at = updated_at
WHERE status IN ('ready', 'completed')
  AND completed_at IS NULL
  AND updated_at IS NOT NULL;

-- ─── product_360_packages: extend status constraint ───────────────────────────
-- Add 'completed' as an accepted status value (alias for 'ready' going forward)
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_status_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_status_check
    CHECK (status IN (
      'draft', 'queued', 'generating', 'processing', 'ready', 'completed', 'failed', 'archived'
    ));

-- ─── product_360_packages: label constraint ───────────────────────────────────
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_label_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_label_check
    CHECK (label IS NULL OR label IN (
      'default', 'limited_time', 'seasonal', 'premium_lighting', 'draft'
    ));

-- ─── product_360_frames: prompt tracking ─────────────────────────────────────
-- Store the exact prompt used to generate each frame (for debugging and replay)
ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS prompt_used text;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS p360_pkg_label_idx
  ON product_360_packages (tenant_id, label)
  WHERE label IS NOT NULL;

CREATE INDEX IF NOT EXISTS p360_pkg_completed_at_idx
  ON product_360_packages (tenant_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;
