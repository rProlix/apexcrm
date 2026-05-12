// lib/website/animations/validateAnimationConfig.ts
// SERVER-ONLY validation of AI-generated animation configs using Zod.
// Ensures no raw JS, no unsafe CSS, and only known preset names reach the DB.

import { z } from 'zod'
import {
  ANIMATION_PRESETS,
  STYLE_PRESETS,
  IMAGE_TREATMENTS,
  BUTTON_TREATMENTS,
  VISUAL_TIERS,
  MOOD_VALUES,
  TYPOGRAPHY_TONES,
  SURFACE_STYLES,
} from './types'

// ── Zod schemas ───────────────────────────────────────────────────────────────

// Pre-processor: converts any non-UUID string to null before UUID validation.
// This is the defence-in-depth guard. Normalization should run first, but even
// if a label still reaches here it is silently dropped instead of throwing.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const nullableUuid = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === '') return null
    if (typeof val === 'string' && UUID_REGEX.test(val)) return val
    // Any other string (e.g. "hero", "features") → strip to null
    return null
  },
  z.string().uuid().nullable().optional(),
)

const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a hex color').default('#000000')

const paletteSchema = z.object({
  primary:    hexColor,
  accent:     hexColor,
  background: hexColor,
  surface:    hexColor,
  text:       hexColor,
})

const globalStyleSchema = z.object({
  visualTier:     z.enum(VISUAL_TIERS).default('premium'),
  mood:           z.enum(MOOD_VALUES).default('modern'),
  typographyTone: z.enum(TYPOGRAPHY_TONES).default('minimal'),
  surfaceStyle:   z.enum(SURFACE_STYLES).default('soft_shadow'),
  recommendedPalette: paletteSchema.default({
    primary: '#1a1a2e', accent: '#7c3aed',
    background: '#ffffff', surface: '#f9f9f9', text: '#1a1a1a',
  }),
})

// Mapping table for targetType normalization inside Zod preprocessing.
// Mirrors TARGET_TYPE_MAP in normalizePremiumDesignPlan.ts — this is the last
// line of defence so we duplicate the compact mapping here rather than importing
// from server-only lib code.
const TARGET_TYPE_COERCE: Record<string, 'page' | 'section' | 'component'> = {
  // page
  page:'page', website:'page', site:'page', global:'page', fullpage:'page',
  full_page:'page', layout:'page', background:'page', whole:'page', all:'page',
  // section
  section:'section', hero:'section', hero_banner:'section', banner:'section',
  feature_grid:'section', features:'section', about:'section', about_us:'section',
  testimonials:'section', reviews:'section', faq:'section', contact:'section',
  pricing:'section', gallery:'section', products:'section', shop:'section',
  services:'section', footer:'section', navigation:'section',
  // component — everything else
  component:'component', text:'component', heading:'component', headline:'component',
  subheading:'component', paragraph:'component', copy:'component', card:'component',
  feature_card:'component', testimonial_card:'component', product_card:'component',
  button:'component', cta:'component', image:'component', logo:'component',
  icon:'component', badge:'component', form:'component', input:'component',
  nav:'component', menu:'component', carousel:'component', grid:'component',
  list:'component', stat:'component', counter:'component', video:'component',
  product_viewer:'component', product_360:'component', spin_360:'component',
}

// Preprocess targetType: coerce invalid strings (e.g. "text", "card") to valid enum values.
const safeTargetType = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return 'section'
    if (typeof val !== 'string') return 'section'
    const key = val.trim().toLowerCase().replace(/[-\s]/g, '_')
    if ((val === 'page' || val === 'section' || val === 'component')) return val
    return TARGET_TYPE_COERCE[key] ?? 'component'
  },
  z.enum(['page', 'section', 'component']),
)

const animationItemSchema = z.object({
  targetType:         safeTargetType.default('section'),
  originalTargetType: z.string().optional(),  // preserved from normalization
  targetKey:          z.string().max(80).default('global'),
  animationPreset:    z.enum(ANIMATION_PRESETS).default('fade_up'),
  intensity:          z.enum(['subtle', 'balanced', 'cinematic']).default('balanced'),
  durationMs:         z.number().int().min(100).max(3000).default(600),
  delayMs:            z.number().int().min(0).max(2000).default(0),
  staggerMs:          z.number().int().min(0).max(800).default(80),
  easing:             z.enum(['standard', 'smooth', 'luxury', 'spring']).default('smooth'),
  mobileEnabled:      z.boolean().default(true),
  reason:             z.string().max(500).default(''),
  // Optional fields Gemini may include for component targeting
  sectionId:          nullableUuid,
  componentType:      z.string().max(80).optional().nullable(),
  componentKey:       z.string().max(80).optional().nullable(),
  componentSelector:  z.string().max(200).optional().nullable(),
}).passthrough()

const sectionUpgradeSchema = z.object({
  sectionId:            nullableUuid,
  sectionType:          z.string().max(60).default(''),
  stylePreset:          z.enum(STYLE_PRESETS).default('none'),
  layoutRecommendation: z.string().max(500).default(''),
  imageTreatment:       z.enum(IMAGE_TREATMENTS).default('none'),
  buttonTreatment:      z.enum(BUTTON_TREATMENTS).default('standard'),
  notes:                z.string().max(500).default(''),
})

const performanceRulesSchema = z.object({
  avoidHeavyAnimationsOnMobile:   z.boolean().default(true),
  respectReducedMotion:           z.literal(true).default(true),
  lazyLoadBelowFold:              z.boolean().default(true),
  maxAnimatedElementsPerViewport: z.number().int().min(1).max(20).default(8),
})

export const aiAnimationPlanSchema = z.object({
  summary:         z.string().max(1000).default(''),
  globalStyle:     globalStyleSchema.default({}),
  animations:      z.array(animationItemSchema).max(30).default([]),
  sectionUpgrades: z.array(sectionUpgradeSchema).max(30).default([]),
  performanceRules: performanceRulesSchema.default({}),
})

export type ValidatedAiAnimationPlan = z.infer<typeof aiAnimationPlanSchema>

/**
 * Validate and sanitize an AI-generated animation plan.
 * Returns a validated plan or an error string.
 */
export function validateAiAnimationPlan(
  raw: unknown,
): { plan: ValidatedAiAnimationPlan; error: null } | { plan: null; error: string } {
  const result = aiAnimationPlanSchema.safeParse(raw)
  if (!result.success) {
    const msgs = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
    return { plan: null, error: `AI plan validation failed: ${msgs}` }
  }
  return { plan: result.data, error: null }
}

// ── Section animation config schema ───────────────────────────────────────────

export const sectionAnimationConfigSchema = z.object({
  v:        z.number().int().min(1).default(1),
  enabled:  z.boolean().default(true),
  animation: z.object({
    preset:       z.enum(ANIMATION_PRESETS).optional(),
    intensity:    z.enum(['subtle', 'balanced', 'cinematic']).optional(),
    durationMs:   z.number().int().min(100).max(3000).optional(),
    delayMs:      z.number().int().min(0).max(2000).optional(),
    staggerMs:    z.number().int().min(0).max(800).optional(),
    easing:       z.enum(['standard', 'smooth', 'luxury', 'spring']).optional(),
    mobileEnabled: z.boolean().optional(),
    disabled:     z.boolean().optional(),
  }).default({}),
  style: z.object({
    stylePreset:          z.enum(STYLE_PRESETS).optional(),
    imageTreatment:       z.enum(IMAGE_TREATMENTS).optional(),
    buttonTreatment:      z.enum(BUTTON_TREATMENTS).optional(),
    layoutRecommendation: z.string().max(300).optional(),
    notes:                z.string().max(300).optional(),
  }).default({}),
  performance: z.object({
    avoidHeavyAnimationsOnMobile:   z.boolean().optional(),
    lazyLoadBelowFold:              z.boolean().optional(),
    maxAnimatedElementsPerViewport: z.number().int().min(1).max(20).optional(),
  }).default({}),
  sourcePlanId: z.string().uuid().optional(),
})

export type ValidatedSectionAnimationConfig = z.infer<typeof sectionAnimationConfigSchema>

export function parseSectionAnimationConfig(raw: unknown): ValidatedSectionAnimationConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const result = sectionAnimationConfigSchema.safeParse(raw)
  return result.success ? result.data : null
}
