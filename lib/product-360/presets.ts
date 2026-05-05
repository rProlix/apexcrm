// lib/product-360/presets.ts
// Canonical preset definitions for the 360 Product Studio.
// Imported by both server (generation) and client (UI).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PresetOption {
  value:       string
  label:       string
  description: string
  icon?:       string
}

// ─── Lighting presets ─────────────────────────────────────────────────────────

export const LIGHTING_PRESETS: PresetOption[] = [
  { value: 'studio_soft',          label: 'Studio Soft',         description: 'Even diffused softboxes, gentle shadows',            icon: '💡' },
  { value: 'high_key_clean',       label: 'High Key Clean',      description: 'Bright white minimal-shadow setup',                  icon: '☀️' },
  { value: 'luxury_dramatic',      label: 'Luxury Dramatic',     description: 'High-contrast editorial with deep shadows',          icon: '🎭' },
  { value: 'retail_bright',        label: 'Retail Bright',       description: 'Clear commercial presentation lighting',             icon: '🏪' },
  { value: 'natural_daylight',     label: 'Natural Daylight',    description: 'Soft window light, airy atmosphere',                 icon: '🌤️' },
  { value: 'warm_food_commercial', label: 'Warm Food',           description: 'Golden commercial food photography lighting',        icon: '🍽️' },
  { value: 'moody_premium',        label: 'Moody Premium',       description: 'Dark background, selective rim lighting',            icon: '🌙' },
  { value: 'glossy_reflective',    label: 'Glossy Reflective',   description: 'Sharp specular highlights, surface sheen',           icon: '✨' },
  { value: 'matte_catalog',        label: 'Matte Catalog',       description: 'Flat even lighting, no harsh shadows',               icon: '📋' },
]

// ─── Background presets ───────────────────────────────────────────────────────

export const BACKGROUND_PRESETS: PresetOption[] = [
  { value: 'pure_white',             label: 'Pure White',          description: 'Classic white seamless background',                 icon: '⬜' },
  { value: 'soft_gradient',          label: 'Soft Gradient',       description: 'Light grey gradient, subtle depth',                 icon: '🌫️' },
  { value: 'dark_luxury',            label: 'Dark Luxury',         description: 'Near-black with subtle vignette',                   icon: '⬛' },
  { value: 'warm_beige',             label: 'Warm Beige',          description: 'Warm linen studio, lifestyle feel',                  icon: '🪵' },
  { value: 'restaurant_tabletop',    label: 'Restaurant Table',    description: 'Marble or slate tabletop, ambient light',           icon: '🍽️' },
  { value: 'marble_surface',         label: 'Marble',              description: 'White marble with natural veining',                 icon: '🏛️' },
  { value: 'neutral_studio',         label: 'Neutral Studio',      description: 'Mid-grey professional catalog background',          icon: '🎬' },
  { value: 'transparent_style_look', label: 'Clean Isolation',     description: 'Optimal for background removal workflow',           icon: '🔲' },
]

// ─── Camera / motion presets ──────────────────────────────────────────────────

export const CAMERA_PRESETS: PresetOption[] = [
  { value: 'hero_spin_18',          label: 'Hero Spin (18)',       description: '18 frames, every 20°, fast preview',               icon: '🎯' },
  { value: 'turntable_standard_24', label: 'Standard (24)',        description: '24 frames, every 15°, e-commerce standard',        icon: '🎪' },
  { value: 'detail_spin_24',        label: 'Detail Spin (24)',     description: '24 frames, close detail perspective',               icon: '🔍' },
  { value: 'turntable_smooth_36',   label: 'Smooth (36)',          description: '36 frames, every 10°, silky rotation',             icon: '🌀' },
  { value: 'premium_showcase_36',   label: 'Premium Showcase (36)', description: '36 frames, premium editorial angles',              icon: '⭐' },
]

// ─── Product category presets ─────────────────────────────────────────────────

export const CATEGORY_PRESETS: PresetOption[] = [
  { value: 'food_bowl',      label: 'Food Bowl',       description: 'Bowls, plates, food items',               icon: '🥣' },
  { value: 'beverage_cup',   label: 'Beverage',        description: 'Cups, bottles, drinks',                   icon: '☕' },
  { value: 'apparel',        label: 'Apparel',         description: 'Clothing, accessories',                   icon: '👕' },
  { value: 'cosmetics',      label: 'Cosmetics',       description: 'Beauty and skincare products',            icon: '💄' },
  { value: 'electronics',    label: 'Electronics',     description: 'Tech gadgets, consumer electronics',      icon: '📱' },
  { value: 'auto_part',      label: 'Auto Part',       description: 'Automotive components',                   icon: '🔧' },
  { value: 'furniture',      label: 'Furniture',       description: 'Home furnishings',                        icon: '🪑' },
  { value: 'jewelry',        label: 'Jewelry',         description: 'Fine jewelry, watches',                   icon: '💎' },
  { value: 'general_product', label: 'General',        description: 'Any standard product',                    icon: '📦' },
]

// ─── Frame count options ──────────────────────────────────────────────────────

export const FRAME_COUNT_OPTIONS = [
  { value: 18, label: '18 frames', description: 'Fast preview, every 20°' },
  { value: 24, label: '24 frames', description: 'Standard, every 15°' },
  { value: 36, label: '36 frames', description: 'Smooth, every 10°' },
]

// ─── Turn direction options ───────────────────────────────────────────────────

export const TURN_DIRECTION_OPTIONS = [
  { value: 'clockwise',         label: 'Clockwise',          icon: '↻' },
  { value: 'counter_clockwise', label: 'Counter-clockwise',  icon: '↺' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLightingPreset(value: string | null): PresetOption | undefined {
  return LIGHTING_PRESETS.find(p => p.value === value) ?? undefined
}

export function getBackgroundPreset(value: string | null): PresetOption | undefined {
  return BACKGROUND_PRESETS.find(p => p.value === value) ?? undefined
}

export function getCameraPreset(value: string | null): PresetOption | undefined {
  return CAMERA_PRESETS.find(p => p.value === value) ?? undefined
}

export function getCategoryPreset(value: string | null): PresetOption | undefined {
  return CATEGORY_PRESETS.find(p => p.value === value) ?? undefined
}
