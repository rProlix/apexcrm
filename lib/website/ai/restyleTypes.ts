// lib/website/ai/restyleTypes.ts
// Types for the AI Restyle Website feature.
// The restyle flow preserves existing content and only modifies visual design.

import type { WebsiteDesignSystem, SectionDesign } from '@/lib/website/design/types'

// ── Request types ─────────────────────────────────────────────────────────────

export type RestyleIntensity = 'subtle' | 'balanced' | 'cinematic'

export type RestyleStylePreset =
  | 'premium_modern'
  | 'luxury_editorial'
  | 'warm_restaurant'
  | 'clean_saas'
  | 'bold_automotive'
  | 'calm_medical'
  | 'elegant_law_firm'
  | 'beauty_spa'
  | 'dark_premium'
  | 'bright_friendly'
  | 'custom'

export interface RestyleRequest {
  tenantId: string
  pageId?: string | null
  stylePreset: RestyleStylePreset | string
  customPrompt?: string | null
  intensity: RestyleIntensity
  preserveContent: boolean
  preserveImages: boolean
  generateImageSuggestions: boolean
  applyAnimations: boolean
  mobileFirst: boolean
}

// ── Restyle plan types ─────────────────────────────────────────────────────────

export interface PageRestyleUpgrade {
  pageId: string
  pageSlug: string
  layoutMood: string
  backgroundStrategy:
    | 'alternating_soft'
    | 'continuous_gradient'
    | 'layered_surfaces'
    | 'image_blend'
    | 'premium_cards'
  sectionFlow:
    | 'soft_blend'
    | 'curved'
    | 'angled'
    | 'layered'
    | 'editorial'
    | 'minimal'
}

export interface SectionRestyleUpgrade {
  sectionId: string | null
  sectionType: string
  title?: string
  design: Partial<SectionDesign>
  layoutVariant: string
  visualIntent: string
  preserveContent: true
}

export interface WebsiteAnimationPlan {
  globalMotionStyle: string
  reducedMotionRespected: boolean
  animations: Array<{
    targetType: 'section' | 'component' | 'page'
    sectionId?: string | null
    targetKey?: string
    preset: string
    intensity: RestyleIntensity
    durationMs: number
    delayMs: number
    easing: string
    mobileEnabled: boolean
    reason: string
  }>
}

export interface WebsiteImageSuggestion {
  sectionId: string | null
  sectionType: string
  slotKey: string
  prompt: string
  style: string
  aspectRatio: string
  notes: string
}

export interface WebsiteContrastFix {
  sectionId: string | null
  sectionType: string
  field: 'textColor' | 'subtextColor' | 'buttonColor' | 'overlay'
  issue: string
  fix: string
}

export interface WebsiteMobileFix {
  sectionId: string | null
  sectionType: string
  issue: string
  fix: string
}

export interface WebsiteRestylePlan {
  summary: string
  designSystem: WebsiteDesignSystem
  pageUpgrades: PageRestyleUpgrade[]
  sectionUpgrades: SectionRestyleUpgrade[]
  animationPlan?: WebsiteAnimationPlan
  imageSuggestions?: WebsiteImageSuggestion[]
  contrastFixes: WebsiteContrastFix[]
  mobileFixes: WebsiteMobileFix[]
  warnings: string[]
  /** AI may optionally recommend a template key */
  recommendedTemplateKey?: string | null
  /** Reason the AI recommends this template */
  recommendedTemplateReason?: string | null
}

// ── API response types ────────────────────────────────────────────────────────

export interface RestyleApiResponse {
  ok: true
  runId: string
  restylePlan: WebsiteRestylePlan
}

export interface RestyleApplyResponse {
  ok: true
  runId: string
  beforeVersionId: string
  afterVersionId: string
  sectionsRestyled: number
  warnings: string[]
}

// ── Section context passed to the prompt builder ──────────────────────────────

export interface RestyleSectionContext {
  id: string
  type: string
  title: string | null
  sortOrder: number
  pageId: string
  currentDesign?: Partial<SectionDesign> | null
}

export interface RestyleBusinessContext {
  businessName: string
  businessType: string
  businessCategory: string
  description: string
  currentTheme?: Record<string, unknown> | null
}
