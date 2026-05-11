// lib/website/animations/types.ts
// Shared TypeScript types for the AI Premium Animation & Luxury UI system.
// Safe to import from both server and client components.

// ── Core enums ────────────────────────────────────────────────────────────────

export type AnimationScope       = 'global' | 'page' | 'section'
export type AnimationStatus      = 'draft' | 'planned' | 'applied' | 'disabled' | 'failed' | 'archived'
export type AnimationIntensity   = 'subtle' | 'balanced' | 'cinematic'
export type AnimationPerformance = 'fast' | 'balanced' | 'premium'
export type AnimationEasing      = 'standard' | 'smooth' | 'luxury' | 'spring'
export type DesiredVibe =
  | 'luxury'
  | 'modern_saas'
  | 'warm_local'
  | 'editorial_boutique'
  | 'futuristic_premium'
  | 'clean_professional'
  | 'bold_conversion'

// ── Allowed preset names (trusted – never from raw AI output) ─────────────────

export const ANIMATION_PRESETS = [
  'fade_up',
  'fade_in',
  'slide_reveal',
  'stagger_cards',
  'parallax_soft',
  'parallax_depth',
  'glass_hover',
  'premium_card_lift',
  'image_float',
  'text_reveal',
  'hero_cinematic',
  'magnetic_button',
  'spotlight_sweep',
  'number_countup',
  'testimonial_carousel',
  'faq_smooth_expand',
] as const

export type AnimationPreset = typeof ANIMATION_PRESETS[number]

export const STYLE_PRESETS = [
  'luxury_hero',
  'premium_grid',
  'editorial_about',
  'glass_testimonials',
  'soft_contact',
  'product_showcase',
  'minimal_faq',
  'cinematic_cta',
  'boutique_gallery',
  'service_showcase',
  'high_trust_reviews',
  'premium_pricing',
  'none',
] as const

export type StylePreset = typeof STYLE_PRESETS[number]

export const IMAGE_TREATMENTS = [
  'none',
  'soft_gradient_overlay',
  'parallax_image',
  'rounded_editorial',
  'floating_product',
  'dark_luxury_overlay',
] as const

export type ImageTreatment = typeof IMAGE_TREATMENTS[number]

export const BUTTON_TREATMENTS = [
  'standard',
  'premium_glow',
  'magnetic',
  'glass',
  'outline_luxury',
] as const

export type ButtonTreatment = typeof BUTTON_TREATMENTS[number]

export const VISUAL_TIERS = ['clean', 'premium', 'luxury', 'ultra_luxury'] as const
export type VisualTier = typeof VISUAL_TIERS[number]

export const MOOD_VALUES = ['modern', 'warm', 'bold', 'minimal', 'editorial', 'futuristic'] as const
export type Mood = typeof MOOD_VALUES[number]

export const TYPOGRAPHY_TONES = ['minimal', 'editorial', 'luxury', 'tech', 'friendly'] as const
export type TypographyTone = typeof TYPOGRAPHY_TONES[number]

export const SURFACE_STYLES = ['flat', 'glass', 'soft_shadow', 'premium_card', 'editorial'] as const
export type SurfaceStyle = typeof SURFACE_STYLES[number]

// ── Per-section animation entry ───────────────────────────────────────────────

export interface SectionAnimationEntry {
  preset:       AnimationPreset
  intensity:    AnimationIntensity
  durationMs:   number
  delayMs:      number
  staggerMs:    number
  easing:       AnimationEasing
  mobileEnabled: boolean
  disabled:     boolean
}

// ── Section style upgrade ─────────────────────────────────────────────────────

export interface SectionStyleEntry {
  stylePreset:          StylePreset
  imageTreatment:       ImageTreatment
  buttonTreatment:      ButtonTreatment
  layoutRecommendation: string
  notes:                string
}

// ── Global style config ────────────────────────────────────────────────────────

export interface GlobalStyleConfig {
  visualTier:     VisualTier
  mood:           Mood
  typographyTone: TypographyTone
  surfaceStyle:   SurfaceStyle
  palette: {
    primary:    string
    accent:     string
    background: string
    surface:    string
    text:       string
  }
}

// ── Performance rules ────────────────────────────────────────────────────────

export interface PerformanceRules {
  avoidHeavyAnimationsOnMobile:   boolean
  respectReducedMotion:           true
  lazyLoadBelowFold:              boolean
  maxAnimatedElementsPerViewport: number
}

// ── Applied animation config (stored in site_sections.animation_config) ───────

export interface SectionAnimationConfig {
  /** Version for forward-compatibility */
  v:              number
  enabled:        boolean
  animation:      Partial<SectionAnimationEntry>
  style:          Partial<SectionStyleEntry>
  performance:    Partial<PerformanceRules>
  /** The plan that generated this config */
  sourcePlanId?:  string
}

// ── Applied page config (stored in site_pages.animation_config) ──────────────

export interface PageAnimationConfig {
  v:          number
  enabled:    boolean
  style:      Partial<GlobalStyleConfig>
  sourcePlanId?: string
}

// ── Applied global config (stored in tenants.website_animation_config) ────────

export interface GlobalAnimationConfig {
  v:            number
  enabled:      boolean
  style:        Partial<GlobalStyleConfig>
  performance:  Partial<PerformanceRules>
  sourcePlanId?: string
}

// ── AI planner result (what Gemini returns) ───────────────────────────────────

export interface AiAnimationPlanItem {
  targetType:     'page' | 'section' | 'component'
  targetKey:      string
  animationPreset: string   // validated before storage
  intensity:      string
  durationMs:     number
  delayMs:        number
  staggerMs:      number
  easing:         string
  mobileEnabled:  boolean
  reason:         string
}

export interface AiSectionUpgrade {
  sectionId?:           string | null
  sectionType:          string
  stylePreset:          string  // validated before storage
  layoutRecommendation: string
  imageTreatment:       string  // validated before storage
  buttonTreatment:      string  // validated before storage
  notes:                string
}

export interface AiAnimationPlan {
  summary:      string
  globalStyle: {
    visualTier:       string
    mood:             string
    recommendedPalette: {
      primary:    string
      accent:     string
      background: string
      surface:    string
      text:       string
    }
    typographyTone:   string
    surfaceStyle:     string
  }
  animations:      AiAnimationPlanItem[]
  sectionUpgrades: AiSectionUpgrade[]
  performanceRules: PerformanceRules
}

// ── DB row type ────────────────────────────────────────────────────────────────

export interface WebsiteAnimationPlan {
  id:                       string
  tenant_id:                string
  site_page_id:             string | null
  site_section_id:          string | null
  created_by:               string | null
  status:                   AnimationStatus
  scope:                    AnimationScope
  prompt_input:             string | null
  desired_vibe:             string | null
  intensity:                AnimationIntensity | null
  performance_mode:         AnimationPerformance | null
  include_mobile_animations: boolean
  business_context:         Record<string, unknown>
  ai_plan:                  Partial<AiAnimationPlan>
  animation_config:         Record<string, unknown>
  style_config:             Record<string, unknown>
  error_message:            string | null
  created_at:               string
  updated_at:               string
  applied_at:               string | null
  disabled_at:              string | null
}
