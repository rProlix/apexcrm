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

const animationItemSchema = z.object({
  targetType:      z.enum(['page', 'section', 'component']).default('section'),
  targetKey:       z.string().max(80).default('global'),
  animationPreset: z.enum(ANIMATION_PRESETS).default('fade_up'),
  intensity:       z.enum(['subtle', 'balanced', 'cinematic']).default('balanced'),
  durationMs:      z.number().int().min(100).max(3000).default(600),
  delayMs:         z.number().int().min(0).max(2000).default(0),
  staggerMs:       z.number().int().min(0).max(800).default(80),
  easing:          z.enum(['standard', 'smooth', 'luxury', 'spring']).default('smooth'),
  mobileEnabled:   z.boolean().default(true),
  reason:          z.string().max(500).default(''),
})

const sectionUpgradeSchema = z.object({
  sectionId:            z.string().uuid().nullable().optional(),
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
