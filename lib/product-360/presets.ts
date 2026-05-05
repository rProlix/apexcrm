// lib/product-360/presets.ts
// Canonical preset definitions for the 360 Product Studio.
// Imported by both server (generation / promptBuilder) and client (UI).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PresetOption {
  value:       string
  label:       string
  description: string
  icon?:       string
}

// ─── Lighting presets ─────────────────────────────────────────────────────────

export const LIGHTING_PRESETS: PresetOption[] = [
  // ── New (user-specified) ──
  { value: 'luxury_softbox',           label: 'Luxury Softbox',           description: 'Large premium softboxes, silky wrap-around light, no harsh shadows',          icon: '💡' },
  { value: 'gold_rim_light',           label: 'Gold Rim Light',           description: 'Warm gold rim backlighting, editorial luxury look',                            icon: '🌟' },
  { value: 'clean_ecommerce_white',    label: 'Clean Ecommerce White',    description: 'Bright flat white, minimal shadows, Amazon-style product presentation',        icon: '⬜' },
  { value: 'dramatic_black_studio',    label: 'Dramatic Black Studio',    description: 'Near-black background, high-contrast selective rim light',                     icon: '🖤' },
  { value: 'natural_window_light',     label: 'Natural Window Light',     description: 'Soft natural daylight from one side, gentle shadows',                         icon: '🌤️' },
  { value: 'neon_showcase',            label: 'Neon Showcase',            description: 'Colorful neon accent lighting, vibrant futuristic product showcase',           icon: '🌈' },
  { value: 'warm_restaurant_tabletop', label: 'Warm Restaurant Tabletop', description: 'Warm golden ambient light, restaurant/food editorial style',                  icon: '🍽️' },
  { value: 'automotive_showroom',      label: 'Automotive Showroom',      description: 'Crisp dealership-quality studio lighting, reflective industrial surfaces',     icon: '🚗' },
  { value: 'jewelry_macro_shine',      label: 'Jewelry Macro Shine',      description: 'Intense macro sparkle lighting, facet highlights, gem fire',                  icon: '💎' },
  { value: 'matte_product_soft_glow',  label: 'Matte Product Soft Glow',  description: 'Soft diffused glow, matte textures, subtle depth',                           icon: '🌫️' },
  // ── Legacy (kept for existing packages) ──
  { value: 'studio_soft',             label: 'Studio Soft',               description: 'Even diffused softboxes, gentle shadows',                                     icon: '💡' },
  { value: 'high_key_clean',          label: 'High Key Clean',            description: 'Bright white minimal-shadow setup',                                           icon: '☀️' },
  { value: 'luxury_dramatic',         label: 'Luxury Dramatic',           description: 'High-contrast editorial with deep shadows',                                   icon: '🎭' },
  { value: 'retail_bright',           label: 'Retail Bright',             description: 'Clear commercial presentation lighting',                                      icon: '🏪' },
  { value: 'natural_daylight',        label: 'Natural Daylight',          description: 'Soft window light, airy atmosphere',                                          icon: '🌤️' },
  { value: 'warm_food_commercial',    label: 'Warm Food',                 description: 'Golden commercial food photography lighting',                                  icon: '🍽️' },
  { value: 'moody_premium',           label: 'Moody Premium',             description: 'Dark background, selective rim lighting',                                     icon: '🌙' },
  { value: 'glossy_reflective',       label: 'Glossy Reflective',         description: 'Sharp specular highlights, surface sheen',                                    icon: '✨' },
  { value: 'matte_catalog',           label: 'Matte Catalog',             description: 'Flat even lighting, no harsh shadows',                                        icon: '📋' },
]

// ─── Background presets ───────────────────────────────────────────────────────

export const BACKGROUND_PRESETS: PresetOption[] = [
  // ── New (user-specified) ──
  { value: 'pure_white',              label: 'Pure White',                  description: 'Pure white seamless studio background, clean product isolation',            icon: '⬜' },
  { value: 'soft_gray_gradient',      label: 'Soft Gray Gradient',          description: 'Soft light-grey gradient, subtle depth and dimension',                     icon: '🌫️' },
  { value: 'deep_black_glass',        label: 'Deep Black Glass',            description: 'Near-black glossy surface, luxury premium feel',                           icon: '⬛' },
  { value: 'warm_beige_studio',       label: 'Warm Beige Studio',           description: 'Warm beige linen studio backdrop, lifestyle editorial feel',               icon: '🪵' },
  { value: 'luxury_gold_accent',      label: 'Luxury Gold Accent',          description: 'Rich warm gold accent background, premium brand presentation',             icon: '🏆' },
  { value: 'restaurant_table',        label: 'Restaurant Table',            description: 'Restaurant-quality tabletop with ambient lighting',                        icon: '🍽️' },
  { value: 'marble_surface',          label: 'Marble Surface',              description: 'White marble with natural veining, elegant studio look',                   icon: '🏛️' },
  { value: 'garage_showroom',         label: 'Garage Showroom',             description: 'Clean garage / workshop floor, automotive / tools style',                  icon: '🏭' },
  { value: 'transparent_isolated',    label: 'Transparent / Isolated',      description: 'Clean neutral background ideal for post-removal and composite use',        icon: '🔲' },
  { value: 'custom_prompt',           label: 'Custom Prompt',               description: 'Describe your own background in the custom notes field',                   icon: '✏️' },
  // ── Legacy (kept for existing packages) ──
  { value: 'soft_gradient',           label: 'Soft Gradient',               description: 'Light grey gradient, subtle depth',                                        icon: '🌫️' },
  { value: 'dark_luxury',             label: 'Dark Luxury',                 description: 'Near-black with subtle vignette',                                          icon: '⬛' },
  { value: 'warm_beige',              label: 'Warm Beige',                  description: 'Warm linen studio, lifestyle feel',                                        icon: '🪵' },
  { value: 'restaurant_tabletop',     label: 'Restaurant Tabletop',         description: 'Marble or slate tabletop, ambient light',                                  icon: '🍽️' },
  { value: 'neutral_studio',          label: 'Neutral Studio',              description: 'Mid-grey professional catalog background',                                  icon: '🎬' },
  { value: 'transparent_style_look',  label: 'Clean Isolation (legacy)',    description: 'Optimal for background removal workflow',                                  icon: '🔲' },
]

// ─── Camera presets ───────────────────────────────────────────────────────────

export const CAMERA_PRESETS: PresetOption[] = [
  // ── New (user-specified) ──
  { value: 'eye_level_product',       label: 'Eye Level Product',           description: 'Straight-on camera at product mid-height, classic e-commerce angle',      icon: '👁️' },
  { value: 'slight_top_down',         label: 'Slight Top Down',             description: 'Gentle overhead tilt ~15°, shows top surface detail',                    icon: '⬇️' },
  { value: 'hero_low_angle',          label: 'Hero Low Angle',              description: 'Low heroic angle looking slightly up, dramatic product presence',         icon: '🦸' },
  { value: 'macro_detail',            label: 'Macro Detail',                description: 'Close macro detail framing, rich texture and material close-up',          icon: '🔍' },
  { value: 'floating_catalog_view',   label: 'Floating Catalog View',       description: 'Slight elevated floating catalog angle, isolated product on clean BG',    icon: '📋' },
  // ── Legacy presets kept for existing packages ──
  { value: 'hero_spin_18',            label: 'Hero Spin (18 frames)',       description: '18 frames every 20°, fast preview',                                       icon: '🎯' },
  { value: 'turntable_standard_24',   label: 'Standard Turntable (24)',     description: '24 frames every 15°, e-commerce standard',                               icon: '🎪' },
  { value: 'detail_spin_24',          label: 'Detail Spin (24)',            description: '24 frames, close detail perspective',                                     icon: '🔍' },
  { value: 'turntable_smooth_36',     label: 'Smooth Turntable (36)',       description: '36 frames every 10°, silky rotation',                                    icon: '🌀' },
  { value: 'premium_showcase_36',     label: 'Premium Showcase (36)',       description: '36 frames, premium editorial angles',                                     icon: '⭐' },
]

// ─── Product category presets ─────────────────────────────────────────────────

export const CATEGORY_PRESETS: PresetOption[] = [
  { value: 'food_bowl',       label: 'Food Bowl',       description: 'Bowls, plates, food items',               icon: '🥣' },
  { value: 'beverage_cup',    label: 'Beverage',        description: 'Cups, bottles, drinks',                   icon: '☕' },
  { value: 'apparel',         label: 'Apparel',         description: 'Clothing, accessories',                   icon: '👕' },
  { value: 'cosmetics',       label: 'Cosmetics',       description: 'Beauty and skincare products',            icon: '💄' },
  { value: 'electronics',     label: 'Electronics',     description: 'Tech gadgets, consumer electronics',      icon: '📱' },
  { value: 'auto_part',       label: 'Auto Part',       description: 'Automotive components',                   icon: '🔧' },
  { value: 'furniture',       label: 'Furniture',       description: 'Home furnishings',                        icon: '🪑' },
  { value: 'jewelry',         label: 'Jewelry',         description: 'Fine jewelry, watches',                   icon: '💎' },
  { value: 'general_product', label: 'General',         description: 'Any standard product',                    icon: '📦' },
]

// ─── Frame count options ──────────────────────────────────────────────────────

export const FRAME_COUNT_OPTIONS: Array<{ value: number; label: string; description: string }> = [
  { value: 12,  label: '12 frames',  description: 'Fast preview, every 30°' },
  { value: 24,  label: '24 frames',  description: 'Standard, every 15° — recommended default' },
  { value: 36,  label: '36 frames',  description: 'Smooth, every 10°' },
  { value: 48,  label: '48 frames',  description: 'Ultra-smooth, every 7.5°' },
]

export const DEFAULT_FRAME_COUNT = 24

// ─── Package label options ────────────────────────────────────────────────────

export const PACKAGE_LABEL_OPTIONS: PresetOption[] = [
  { value: 'default',          label: 'Default',           description: 'Primary package shown to customers',       icon: '⭐' },
  { value: 'limited_time',     label: 'Limited Time Promo', description: 'Promotional package with start/end dates', icon: '⏰' },
  { value: 'seasonal',         label: 'Seasonal',          description: 'Holiday or seasonal variation',            icon: '🎄' },
  { value: 'premium_lighting', label: 'Premium Lighting',  description: 'High-end lighting variation',              icon: '💡' },
  { value: 'draft',            label: 'Draft',             description: 'Work in progress, not visible to customers', icon: '✏️' },
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

export function getPackageLabel(value: string | null): PresetOption | undefined {
  return PACKAGE_LABEL_OPTIONS.find(p => p.value === value) ?? undefined
}
