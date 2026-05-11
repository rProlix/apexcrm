// lib/website/animations/presets.ts
// Safe animation preset definitions.
// Maps preset names to Framer Motion variant configs and Tailwind class bundles.
// AI only selects preset NAMES; code maps them to trusted configs here.

import type { Variants } from 'framer-motion'
import type { AnimationPreset, StylePreset, AnimationEasing } from './types'

// ── Easing curves ──────────────────────────────────────────────────────────────

export const EASING_CURVES: Record<AnimationEasing, [number, number, number, number]> = {
  standard: [0.4, 0, 0.2, 1],
  smooth:   [0.25, 0.1, 0.25, 1],
  luxury:   [0.16, 1, 0.3, 1],   // expo out — very smooth premium feel
  spring:   [0.34, 1.56, 0.64, 1],
}

// ── Framer Motion variant configs ─────────────────────────────────────────────

export type MotionVariants = Variants

export function getAnimationVariants(
  preset: AnimationPreset,
  easing: AnimationEasing = 'smooth',
  durationMs = 600,
  delayMs = 0,
): Variants {
  const dur = durationMs / 1000
  const del = delayMs / 1000
  const ease = EASING_CURVES[easing]

  const base = { transition: { duration: dur, delay: del, ease } }

  switch (preset) {
    case 'fade_up':
      return {
        hidden:  { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, ...base },
      }
    case 'fade_in':
      return {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, ...base },
      }
    case 'slide_reveal':
      return {
        hidden:  { opacity: 0, x: -24 },
        visible: { opacity: 1, x: 0, ...base },
      }
    case 'stagger_cards':
      return {
        hidden:  { opacity: 0, y: 16, scale: 0.97 },
        visible: { opacity: 1, y: 0, scale: 1, ...base },
      }
    case 'parallax_soft':
    case 'parallax_depth':
      return {
        hidden:  { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, ...base },
      }
    case 'glass_hover':
    case 'premium_card_lift':
      return {
        hidden:  { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, ...base },
      }
    case 'image_float':
      return {
        hidden:  { opacity: 0, y: 12, scale: 0.98 },
        visible: { opacity: 1, y: 0, scale: 1, ...base },
      }
    case 'text_reveal':
    case 'hero_cinematic':
      return {
        hidden:  { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0, ...base },
      }
    case 'magnetic_button':
    case 'spotlight_sweep':
      return {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, ...base },
      }
    case 'number_countup':
      return {
        hidden:  { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, ...base },
      }
    case 'testimonial_carousel':
      return {
        hidden:  { opacity: 0, x: 16 },
        visible: { opacity: 1, x: 0, ...base },
      }
    case 'faq_smooth_expand':
      return {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, ...base },
      }
    default:
      return {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, ...base },
      }
  }
}

// ── Style preset → Tailwind class bundles ─────────────────────────────────────
// These are HARDCODED trusted mappings. AI never outputs raw class strings.

export const STYLE_PRESET_CLASSES: Record<StylePreset, string> = {
  luxury_hero:        'relative overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800',
  premium_grid:       'bg-white dark:bg-zinc-950 py-20',
  editorial_about:    'bg-stone-50 dark:bg-zinc-900 py-16',
  glass_testimonials: 'bg-gradient-to-b from-violet-950/20 to-transparent py-20 backdrop-blur-sm',
  soft_contact:       'bg-slate-50 dark:bg-zinc-900 rounded-3xl mx-4 my-8 shadow-sm',
  product_showcase:   'bg-white dark:bg-zinc-950 py-16',
  minimal_faq:        'bg-stone-50 dark:bg-zinc-900 py-16 max-w-3xl mx-auto px-6',
  cinematic_cta:      'relative bg-gradient-to-r from-violet-900 to-indigo-900 text-white py-20 overflow-hidden',
  boutique_gallery:   'bg-stone-100 dark:bg-zinc-900 py-12',
  service_showcase:   'bg-white dark:bg-zinc-950 py-16',
  high_trust_reviews: 'bg-gradient-to-b from-white to-slate-50 dark:from-zinc-950 dark:to-zinc-900 py-20',
  premium_pricing:    'bg-white dark:bg-zinc-950 py-20',
  none:               '',
}

// ── Image treatment → CSS class ───────────────────────────────────────────────

export const IMAGE_TREATMENT_CLASSES: Record<string, string> = {
  none:                    '',
  soft_gradient_overlay:   'after:absolute after:inset-0 after:bg-gradient-to-t after:from-black/60 after:to-transparent',
  parallax_image:          'overflow-hidden',
  rounded_editorial:       'rounded-2xl overflow-hidden',
  floating_product:        'drop-shadow-2xl',
  dark_luxury_overlay:     'after:absolute after:inset-0 after:bg-black/50',
}

// ── Button treatment → CSS class ─────────────────────────────────────────────

export const BUTTON_TREATMENT_CLASSES: Record<string, string> = {
  standard:       '',
  premium_glow:   'shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-shadow',
  magnetic:       'transition-transform hover:-translate-y-0.5',
  glass:          'bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20',
  outline_luxury: 'bg-transparent border-2 border-current hover:bg-current hover:text-white transition-colors',
}

// ── Preset label map (for UI display) ────────────────────────────────────────

export const PRESET_LABELS: Record<AnimationPreset, string> = {
  fade_up:            'Fade Up',
  fade_in:            'Fade In',
  slide_reveal:       'Slide Reveal',
  stagger_cards:      'Stagger Cards',
  parallax_soft:      'Soft Parallax',
  parallax_depth:     'Depth Parallax',
  glass_hover:        'Glass Hover',
  premium_card_lift:  'Premium Card Lift',
  image_float:        'Image Float',
  text_reveal:        'Text Reveal',
  hero_cinematic:     'Hero Cinematic',
  magnetic_button:    'Magnetic Button',
  spotlight_sweep:    'Spotlight Sweep',
  number_countup:     'Number Countup',
  testimonial_carousel: 'Testimonial Carousel',
  faq_smooth_expand:  'Smooth FAQ Expand',
}
