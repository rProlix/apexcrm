// lib/website/canva/pdf-animation-recreator.ts
// Maps inferred Canva-like motion onto NexoraNow animation presets.
//
// TRUTH: a Canva PDF export is static and carries no real animation data. We
// never claim exact Canva animation extraction. Instead we recreate a tasteful
// motion layer from the section role + the user's chosen recreation level.
// Pure + dependency-free; safe on client + server.

export const NEXORA_ANIMATION_PRESETS = [
  'fadeIn', 'fadeUp', 'slideInLeft', 'slideInRight', 'zoomIn', 'softParallax',
  'staggerText', 'imageReveal', 'floating', 'subtleRotate', 'maskReveal',
  'premiumBlurReveal', 'none',
] as const
export type NexoraAnimationPreset = (typeof NEXORA_ANIMATION_PRESETS)[number]

export const ANIMATION_LEVELS = ['subtle', 'balanced', 'premium_cinematic'] as const
export type AnimationLevel = (typeof ANIMATION_LEVELS)[number]

export function normalizeAnimationLevel(value: unknown): AnimationLevel {
  const v = String(value ?? '').toLowerCase()
  if (v === 'premium' || v === 'premium_cinematic' || v === 'cinematic') return 'premium_cinematic'
  if (v === 'subtle') return 'subtle'
  return 'balanced'
}

export function isAnimationPreset(value: unknown): value is NexoraAnimationPreset {
  return typeof value === 'string' && (NEXORA_ANIMATION_PRESETS as readonly string[]).includes(value)
}

/** Role hints used to choose a sensible default preset per section. */
export type SectionRole =
  | 'hero' | 'heading' | 'background' | 'decorative' | 'gallery' | 'cta'
  | 'details' | 'about' | 'transition' | 'generic'

const ROLE_PRESET: Record<SectionRole, { subtle: NexoraAnimationPreset; balanced: NexoraAnimationPreset; premium_cinematic: NexoraAnimationPreset }> = {
  hero:       { subtle: 'fadeIn',    balanced: 'fadeUp',       premium_cinematic: 'premiumBlurReveal' },
  heading:    { subtle: 'fadeUp',    balanced: 'staggerText',  premium_cinematic: 'staggerText' },
  background: { subtle: 'fadeIn',    balanced: 'softParallax', premium_cinematic: 'softParallax' },
  decorative: { subtle: 'fadeIn',    balanced: 'floating',     premium_cinematic: 'subtleRotate' },
  gallery:    { subtle: 'fadeIn',    balanced: 'imageReveal',  premium_cinematic: 'maskReveal' },
  cta:        { subtle: 'fadeUp',    balanced: 'fadeUp',       premium_cinematic: 'zoomIn' },
  details:    { subtle: 'fadeUp',    balanced: 'staggerText',  premium_cinematic: 'staggerText' },
  about:      { subtle: 'fadeIn',    balanced: 'fadeUp',       premium_cinematic: 'premiumBlurReveal' },
  transition: { subtle: 'fadeIn',    balanced: 'zoomIn',       premium_cinematic: 'zoomIn' },
  generic:    { subtle: 'fadeIn',    balanced: 'fadeUp',       premium_cinematic: 'fadeUp' },
}

/** Infers a section role from its section_type + content. */
export function inferSectionRole(sectionType: string, content?: Record<string, unknown>): SectionRole {
  switch (sectionType) {
    case 'hero': return 'hero'
    case 'image_gallery':
    case 'gallery': return 'gallery'
    case 'cta': return 'cta'
    case 'about': return 'about'
    case 'feature_grid': return 'details'
    case 'rich_text': return 'details'
    case 'banner': return 'transition'
    default:
      if (content && typeof content.backgroundImage === 'string') return 'background'
      return 'generic'
  }
}

/** Resolves a preset for a section given the chosen recreation level. */
export function presetForSection(
  sectionType: string,
  level: AnimationLevel,
  content?: Record<string, unknown>,
  aiHint?: unknown,
): NexoraAnimationPreset {
  if (isAnimationPreset(aiHint)) return aiHint
  const role = inferSectionRole(sectionType, content)
  return ROLE_PRESET[role][level]
}

export interface SectionAnimation {
  preset: NexoraAnimationPreset
  /** Whole-section reveal delay in seconds. */
  delay: number
  /** Per-child stagger in seconds (for staggerText / galleries). */
  stagger: number
  /** Reveal duration in seconds. */
  duration: number
  /** Whether interactive elements (CTAs) get hover motion. */
  hover: boolean
}

const LEVEL_TIMING: Record<AnimationLevel, { duration: number; stagger: number; hover: boolean }> = {
  subtle:            { duration: 0.5, stagger: 0.05, hover: false },
  balanced:          { duration: 0.7, stagger: 0.08, hover: true },
  premium_cinematic: { duration: 1.0, stagger: 0.12, hover: true },
}

export function buildSectionAnimation(
  sectionType: string,
  index: number,
  level: AnimationLevel,
  content?: Record<string, unknown>,
  aiHint?: unknown,
): SectionAnimation {
  const timing = LEVEL_TIMING[level]
  return {
    preset: presetForSection(sectionType, level, content, aiHint),
    delay: Math.min(index * 0.06, 0.4),
    stagger: timing.stagger,
    duration: timing.duration,
    hover: timing.hover && (sectionType === 'cta' || sectionType === 'hero'),
  }
}

export interface AnimationMapping {
  globalStyle: AnimationLevel
  note: string
  sectionAnimations: Array<{ sectionKey: string; sectionType: string; preset: NexoraAnimationPreset; role: SectionRole }>
  warnings: string[]
}

export const PDF_ANIMATION_NOTE =
  'PDF exports are static, so Canva animations are recreated as NexoraNow animations where possible. For exact Canva animation playback, use Preserve Canva Mode with a Canva URL/embed.'

/** Builds the persisted animation_mapping for a converted section list. */
export function buildAnimationMapping(
  sections: Array<{ section_key?: string; section_type: string; content?: Record<string, unknown>; animationHint?: unknown }>,
  level: AnimationLevel,
): AnimationMapping {
  return {
    globalStyle: level,
    note: PDF_ANIMATION_NOTE,
    sectionAnimations: sections.map((s, i) => ({
      sectionKey: s.section_key ?? `section-${i}`,
      sectionType: s.section_type,
      preset: presetForSection(s.section_type, level, s.content, s.animationHint),
      role: inferSectionRole(s.section_type, s.content),
    })),
    warnings: [PDF_ANIMATION_NOTE],
  }
}
