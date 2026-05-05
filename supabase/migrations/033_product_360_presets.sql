-- ============================================================
-- Migration 033: 360 Product Studio — Presets & Gemini Support
-- ============================================================
-- Adds rich preset columns to product_360_packages:
--   lighting, background, category, camera presets +
--   numeric control columns (distance, height, fov, zoom, shadows, reflection).
-- Changes generation_provider default from 'imagine_midjourney' → 'gemini'.
-- Adds ai_model column (default 'gemini-2.5-flash-lite').
-- Adds promo_tag, generation_notes, output dimensions.
-- Idempotent via IF NOT EXISTS / IF EXISTS guards.
-- ============================================================

-- ─── product_360_packages: preset columns ────────────────────────────────────

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS lighting_preset    text,
  ADD COLUMN IF NOT EXISTS background_preset  text,
  ADD COLUMN IF NOT EXISTS category_preset    text,
  ADD COLUMN IF NOT EXISTS camera_preset      text,
  ADD COLUMN IF NOT EXISTS camera_distance    numeric,
  ADD COLUMN IF NOT EXISTS camera_height      numeric,
  ADD COLUMN IF NOT EXISTS fov                numeric,
  ADD COLUMN IF NOT EXISTS zoom               numeric,
  ADD COLUMN IF NOT EXISTS shadow_strength    numeric,
  ADD COLUMN IF NOT EXISTS reflection_intensity numeric,
  ADD COLUMN IF NOT EXISTS turn_direction     text  NOT NULL DEFAULT 'clockwise',
  ADD COLUMN IF NOT EXISTS output_width       integer,
  ADD COLUMN IF NOT EXISTS output_height      integer,
  ADD COLUMN IF NOT EXISTS promo_tag          text,
  ADD COLUMN IF NOT EXISTS generation_notes   text,
  ADD COLUMN IF NOT EXISTS ai_model           text  NOT NULL DEFAULT 'gemini-2.5-flash-lite';

-- turn_direction check
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_turn_direction_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_turn_direction_check
    CHECK (turn_direction IN ('clockwise', 'counter_clockwise'));

-- Change default provider for NEW rows to gemini
-- (existing rows keep their previous provider value)
ALTER TABLE product_360_packages
  ALTER COLUMN generation_provider SET DEFAULT 'gemini';

-- Migrate any null generation_provider rows to 'gemini'
UPDATE product_360_packages
SET generation_provider = 'gemini'
WHERE generation_provider IS NULL;

-- ─── product_360_generation_jobs: ai_model column ────────────────────────────

ALTER TABLE product_360_generation_jobs
  ADD COLUMN IF NOT EXISTS ai_model   text  NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  ADD COLUMN IF NOT EXISTS model_used text;

-- Change default provider for jobs
ALTER TABLE product_360_generation_jobs
  ALTER COLUMN provider SET DEFAULT 'gemini';

-- ─── Preset validation checks (informational, not strict) ────────────────────

-- lighting_preset allowed values
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_lighting_preset_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_lighting_preset_check
    CHECK (lighting_preset IS NULL OR lighting_preset IN (
      'studio_soft', 'high_key_clean', 'luxury_dramatic', 'retail_bright',
      'natural_daylight', 'warm_food_commercial', 'moody_premium',
      'glossy_reflective', 'matte_catalog'
    ));

-- background_preset allowed values
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_background_preset_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_background_preset_check
    CHECK (background_preset IS NULL OR background_preset IN (
      'pure_white', 'soft_gradient', 'dark_luxury', 'warm_beige',
      'restaurant_tabletop', 'marble_surface', 'neutral_studio',
      'transparent_style_look'
    ));

-- category_preset allowed values
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_category_preset_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_category_preset_check
    CHECK (category_preset IS NULL OR category_preset IN (
      'food_bowl', 'beverage_cup', 'apparel', 'cosmetics',
      'electronics', 'auto_part', 'furniture', 'jewelry', 'general_product'
    ));

-- camera_preset allowed values
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_camera_preset_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_camera_preset_check
    CHECK (camera_preset IS NULL OR camera_preset IN (
      'turntable_standard_24', 'turntable_smooth_36', 'hero_spin_18',
      'detail_spin_24', 'premium_showcase_36'
    ));

-- ─── Additional indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS p360_pkg_provider_idx
  ON product_360_packages(generation_provider);

CREATE INDEX IF NOT EXISTS p360_pkg_promo_tag_idx
  ON product_360_packages(tenant_id, promo_tag)
  WHERE promo_tag IS NOT NULL;
