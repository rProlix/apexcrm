-- ============================================================
-- Migration 039: Fix 360 preset CHECK constraints
-- ============================================================
-- Migration 033 defined constraints with the legacy preset values only.
-- presets.ts has since been expanded with new preset keys.
-- This migration drops and recreates all three preset constraints so that
-- every value currently in lib/product-360/presets.ts is allowed.
-- Idempotent: uses DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT.
-- ============================================================

-- ─── camera_preset ───────────────────────────────────────────────────────────
-- DB had: hero_spin_18, turntable_standard_24, detail_spin_24,
--         turntable_smooth_36, premium_showcase_36
-- New additions: eye_level_product, slight_top_down, hero_low_angle,
--                macro_detail, floating_catalog_view

ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_camera_preset_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_camera_preset_check
    CHECK (camera_preset IS NULL OR camera_preset IN (
      -- new presets (lib/product-360/presets.ts)
      'eye_level_product',
      'slight_top_down',
      'hero_low_angle',
      'macro_detail',
      'floating_catalog_view',
      -- legacy (kept for existing rows)
      'hero_spin_18',
      'turntable_standard_24',
      'detail_spin_24',
      'turntable_smooth_36',
      'premium_showcase_36'
    ));

-- ─── lighting_preset ─────────────────────────────────────────────────────────
-- DB had: studio_soft, high_key_clean, luxury_dramatic, retail_bright,
--         natural_daylight, warm_food_commercial, moody_premium,
--         glossy_reflective, matte_catalog
-- New additions: luxury_softbox, gold_rim_light, clean_ecommerce_white,
--   dramatic_black_studio, natural_window_light, neon_showcase,
--   warm_restaurant_tabletop, automotive_showroom, jewelry_macro_shine,
--   matte_product_soft_glow

ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_lighting_preset_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_lighting_preset_check
    CHECK (lighting_preset IS NULL OR lighting_preset IN (
      -- new presets
      'luxury_softbox',
      'gold_rim_light',
      'clean_ecommerce_white',
      'dramatic_black_studio',
      'natural_window_light',
      'neon_showcase',
      'warm_restaurant_tabletop',
      'automotive_showroom',
      'jewelry_macro_shine',
      'matte_product_soft_glow',
      -- legacy
      'studio_soft',
      'high_key_clean',
      'luxury_dramatic',
      'retail_bright',
      'natural_daylight',
      'warm_food_commercial',
      'moody_premium',
      'glossy_reflective',
      'matte_catalog'
    ));

-- ─── background_preset ───────────────────────────────────────────────────────
-- DB had: pure_white, soft_gradient, dark_luxury, warm_beige,
--         restaurant_tabletop, marble_surface, neutral_studio,
--         transparent_style_look
-- New additions: soft_gray_gradient, deep_black_glass, warm_beige_studio,
--   luxury_gold_accent, restaurant_table, garage_showroom,
--   transparent_isolated, custom_prompt

ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_background_preset_check;

ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_background_preset_check
    CHECK (background_preset IS NULL OR background_preset IN (
      -- new presets
      'soft_gray_gradient',
      'deep_black_glass',
      'warm_beige_studio',
      'luxury_gold_accent',
      'restaurant_table',
      'garage_showroom',
      'transparent_isolated',
      'custom_prompt',
      -- legacy
      'pure_white',
      'soft_gradient',
      'dark_luxury',
      'warm_beige',
      'restaurant_tabletop',
      'marble_surface',
      'neutral_studio',
      'transparent_style_look'
    ));
