// lib/website/canva/animation-mapper.ts
// Maps Canva (and generic export) animation names/classes to NexoraNow animation
// presets. Pure + dependency-free; safe on client + server.
//
// NexoraNow presets (align with the existing animation system / lib/motion):
//   none | fadeIn | fadeUp | slideIn | slideLeft | slideRight | zoom |
//   rotateIn | subtleRotate | parallax | reveal | maskReveal | textReveal |
//   stagger | floating | scalePulse

export type NexoraAnimationPreset =
  | 'none' | 'fadeIn' | 'fadeUp' | 'slideIn' | 'slideLeft' | 'slideRight'
  | 'zoom' | 'rotateIn' | 'subtleRotate' | 'parallax' | 'reveal' | 'maskReveal'
  | 'textReveal' | 'stagger' | 'floating' | 'scalePulse'

// Canva animation name (lowercased) → NexoraNow preset.
const CANVA_MAP: Record<string, NexoraAnimationPreset> = {
  fade:        'fadeIn',
  rise:        'fadeUp',
  'fade up':   'fadeUp',
  fadeup:      'fadeUp',
  tumble:      'rotateIn',
  spin:        'subtleRotate',
  pan:         'slideIn',
  slide:       'slideIn',
  'slide left': 'slideLeft',
  'slide right': 'slideRight',
  breathe:     'scalePulse',
  pulse:       'scalePulse',
  drift:       'floating',
  float:       'floating',
  block:       'maskReveal',
  reveal:      'maskReveal',
  typewriter:  'textReveal',
  type:        'textReveal',
  baseline:    'fadeUp',
  zoom:        'zoom',
  pop:         'zoom',
  stomp:       'scalePulse',
  neon:        'fadeIn',
  flicker:     'fadeIn',
  none:        'none',
  unknown:     'none',
}

/** Maps a single Canva animation name/class to a NexoraNow preset. */
export function mapCanvaAnimation(input: string | null | undefined): NexoraAnimationPreset {
  if (!input) return 'none'
  const key = input.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (CANVA_MAP[key]) return CANVA_MAP[key]
  // Substring fallbacks for class names like "anim-fade-in", "kf_rise_2".
  for (const [name, preset] of Object.entries(CANVA_MAP)) {
    if (name !== 'none' && name !== 'unknown' && key.includes(name)) return preset
  }
  return 'none'
}

export interface DetectedAnimation {
  source: string
  preset: NexoraAnimationPreset
}

/**
 * Scans raw exported HTML/CSS for animation hints (CSS @keyframes names,
 * data-animate attributes, common class tokens) and maps them to presets.
 */
export function detectAnimationsFromHtml(html: string): DetectedAnimation[] {
  if (!html) return []
  const found = new Set<string>()

  // @keyframes <name>
  for (const m of html.matchAll(/@(?:-\w+-)?keyframes\s+([\w-]+)/gi)) {
    if (m[1]) found.add(m[1])
  }
  // data-animation / data-animate="<name>"
  for (const m of html.matchAll(/data-anim(?:ation|ate)?=["']([^"']+)["']/gi)) {
    if (m[1]) found.add(m[1])
  }
  // class tokens that look animation-ish
  for (const m of html.matchAll(/class=["']([^"']*?(?:anim|fade|slide|zoom|rise|reveal|float)[^"']*)["']/gi)) {
    for (const tok of (m[1] ?? '').split(/\s+/)) {
      if (/anim|fade|slide|zoom|rise|reveal|float/i.test(tok)) found.add(tok)
    }
  }

  const out: DetectedAnimation[] = []
  for (const source of found) {
    const preset = mapCanvaAnimation(source)
    if (preset !== 'none') out.push({ source, preset })
  }
  return out
}
