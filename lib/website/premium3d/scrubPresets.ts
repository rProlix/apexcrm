// lib/website/premium3d/scrubPresets.ts
//
// Video/image-sequence scroll-scrub presets for the Premium 3D Hero Media Studio.
// Each preset only sets sensible *settings* (scroll length, smoothing, palette,
// fallback behaviour, text timing, …). It never fabricates media — uploaded
// assets and their active references are preserved by the Studio when a preset
// is applied. Safe for both server and client (pure JSON).
//
// NOTE: scrollLength is expressed as a multiple of viewport height (matches the
// renderer / GSAP ScrollTrigger), not raw pixels.

import type {
  Premium3DScrollHeroContent,
  ScrollHeroPalette,
  TextRevealTiming,
  VideoObjectFit,
  VideoScrubSubMode,
  MobileFallbackMode,
  ReducedMotionFallback,
} from './types'

export interface ScrubPreset {
  key:   string
  label: string
  description: string
  /** Suggested sub-mode; the Studio keeps the user's existing media. */
  mode:  VideoScrubSubMode
  scrollLength:    number
  pinOnScroll:     boolean
  scrubSmoothing:  number
  textRevealTiming: TextRevealTiming
  objectFit:       VideoObjectFit
  overlayOpacity:  number
  mobileFallbackMode:    MobileFallbackMode
  reducedMotionFallback: ReducedMotionFallback
  palette: ScrollHeroPalette
}

export const SCRUB_PRESETS: ScrubPreset[] = [
  {
    key: 'construction_build', label: 'Construction Build', mode: 'image_sequence',
    description: 'Foundation → finished build revealed late as you scroll.',
    scrollLength: 3.0, pinOnScroll: true, scrubSmoothing: 0.14, textRevealTiming: 'late',
    objectFit: 'cover', overlayOpacity: 0.45,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#0d0f14', foreground: '#f8fafc', accent: '#f97316', muted: '#94a3b8', glow: '#fb923c' },
  },
  {
    key: 'product_reveal', label: 'Product Reveal', mode: 'video',
    description: 'A product reveals early/middle with a clean contained frame.',
    scrollLength: 2.0, pinOnScroll: true, scrubSmoothing: 0.1, textRevealTiming: 'early',
    objectFit: 'contain', overlayOpacity: 0.3,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#0c0c14', foreground: '#fafafa', accent: '#f59e0b', muted: '#a1a1aa', glow: '#fbbf24' },
  },
  {
    key: 'restaurant_dish', label: 'Restaurant Dish Assembly', mode: 'video',
    description: 'Ingredients assemble into a finished dish through scroll.',
    scrollLength: 2.4, pinOnScroll: true, scrubSmoothing: 0.12, textRevealTiming: 'middle',
    objectFit: 'cover', overlayOpacity: 0.4,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#140d0a', foreground: '#fff7ed', accent: '#ef4444', muted: '#d6b8a3', glow: '#f87171' },
  },
  {
    key: 'salon_before_after', label: 'Salon Before/After', mode: 'image_sequence',
    description: 'A before/after makeover story revealed by scrolling.',
    scrollLength: 2.2, pinOnScroll: true, scrubSmoothing: 0.12, textRevealTiming: 'middle',
    objectFit: 'cover', overlayOpacity: 0.35,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#130a12', foreground: '#fdf2f8', accent: '#ec4899', muted: '#cba5bd', glow: '#f472b6' },
  },
  {
    key: 'vehicle_showcase', label: 'Vehicle Showcase', mode: 'video',
    description: 'A vehicle showcased like a premium showroom turntable.',
    scrollLength: 2.6, pinOnScroll: true, scrubSmoothing: 0.1, textRevealTiming: 'middle',
    objectFit: 'cover', overlayOpacity: 0.4,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#0a0d12', foreground: '#f1f5f9', accent: '#38bdf8', muted: '#94a3b8', glow: '#7dd3fc' },
  },
  {
    key: 'luxury_service_story', label: 'Luxury Service Story', mode: 'video',
    description: 'A cinematic premium reveal for high-end services.',
    scrollLength: 2.8, pinOnScroll: true, scrubSmoothing: 0.16, textRevealTiming: 'late',
    objectFit: 'cover', overlayOpacity: 0.5,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#0a0a0f', foreground: '#fafafa', accent: '#c7a14a', muted: '#9ca3af', glow: '#e5c97b' },
  },
  {
    key: 'fitness_transformation', label: 'Fitness Transformation', mode: 'image_sequence',
    description: 'A transformation story animated through scroll.',
    scrollLength: 2.4, pinOnScroll: true, scrubSmoothing: 0.12, textRevealTiming: 'middle',
    objectFit: 'cover', overlayOpacity: 0.38,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#0c1110', foreground: '#ecfdf5', accent: '#22c55e', muted: '#9ca3af', glow: '#4ade80' },
  },
  {
    key: 'trades_process', label: 'Trades Process', mode: 'video',
    description: 'Service steps and process shown stage by stage.',
    scrollLength: 2.2, pinOnScroll: true, scrubSmoothing: 0.12, textRevealTiming: 'middle',
    objectFit: 'cover', overlayOpacity: 0.4,
    mobileFallbackMode: 'poster', reducedMotionFallback: 'poster',
    palette: { background: '#0b1014', foreground: '#ecfeff', accent: '#06b6d4', muted: '#94a3b8', glow: '#22d3ee' },
  },
]

export const SCRUB_PRESET_MAP = new Map(SCRUB_PRESETS.map((p) => [p.key, p]))

/**
 * Returns the content changes for a scrub preset, MERGED over the current
 * content. Preserves existing media + active asset references (only settings
 * change). Returns flat fields and a fully-formed videoScrub object.
 */
export function buildScrubPresetPatch(
  presetKey: string,
  current: Premium3DScrollHeroContent,
): Partial<Premium3DScrollHeroContent> {
  const p = SCRUB_PRESET_MAP.get(presetKey)
  if (!p) return {}
  const scrub = current.videoScrub!
  return {
    renderMode:            'video_scrub',
    useImageSequence:      p.mode === 'image_sequence',
    scrollLength:          p.scrollLength,
    pinOnScroll:           p.pinOnScroll,
    scrubSmoothing:        p.scrubSmoothing,
    videoObjectFit:        p.objectFit,
    overlayOpacity:        p.overlayOpacity,
    textRevealTiming:      p.textRevealTiming,
    mobileFallbackMode:    p.mobileFallbackMode,
    reducedMotionFallback: p.reducedMotionFallback,
    palette:               { ...p.palette },
    presetKey:             p.key,
    videoScrub: {
      ...scrub,
      enabled:               true,
      mode:                  p.mode,
      playbackBehavior:      'scroll_scrub',
      pinOnScroll:           p.pinOnScroll,
      scrollLength:          p.scrollLength,
      scrubSmoothing:        p.scrubSmoothing,
      objectFit:             p.objectFit,
      overlayOpacity:        p.overlayOpacity,
      textRevealTiming:      p.textRevealTiming,
      mobileFallbackMode:    p.mobileFallbackMode,
      reducedMotionFallback: p.reducedMotionFallback,
    },
  }
}
