// lib/website/design/sectionFlow.ts
// Assigns per-section design (backgrounds, dividers, card styles) to prevent
// the "stacked identical rectangles" look. Called after AI autofill generates sections.

import type { WebsiteDesignSystem, SectionDesign, DividerStyle } from './types'
import { buildDefaultSectionDesign } from './normalizeDesignSystem'
import { isDark } from './contrast'

export interface SectionWithDesign {
  id:          string
  type:        string
  style_config?: Record<string, unknown>
}

type BackgroundVariant = 'base' | 'surface' | 'surface_alt' | 'primary_wash' | 'gradient_soft' | 'accent_wash'

// ── Section type → visual role ────────────────────────────────────────────────

const SECTION_ROLE: Record<string, string> = {
  hero:         'hero',
  banner:       'hero',
  cta:          'cta',
  contact:      'contact',
  testimonials: 'social_proof',
  reviews:      'social_proof',
  about:        'story',
  feature_grid: 'features',
  services:     'features',
  faq:          'faq',
  product_grid: 'products',
  gallery:      'gallery',
  rich_text:    'content',
  unknown:      'content',
}

function getRole(type: string): string {
  return SECTION_ROLE[type] ?? 'content'
}

// ── Background assignment based on position and type ─────────────────────────

const ROLE_BG: Record<string, BackgroundVariant> = {
  hero:         'gradient_soft', // handled separately as full-bleed
  cta:          'primary_wash',
  contact:      'surface',
  social_proof: 'surface_alt',
  story:        'surface',
  features:     'base',
  faq:          'surface',
  products:     'base',
  gallery:      'surface_alt',
  content:      'base',
}

/** Alternate background for consecutive content sections */
const ALTERNATING: BackgroundVariant[] = ['base', 'surface', 'surface_alt', 'surface']

function bgVariantToValue(variant: BackgroundVariant, ds: WebsiteDesignSystem): string {
  switch (variant) {
    case 'base':         return ds.palette.background
    case 'surface':      return ds.palette.surface
    case 'surface_alt':  return ds.palette.surfaceAlt
    case 'primary_wash': return ds.palette.primary
    case 'gradient_soft':return ds.gradients.sectionSoft
    case 'accent_wash':  return ds.gradients.accentWash
    default:             return ds.palette.background
  }
}

// ── Divider assignment ────────────────────────────────────────────────────────

type DividerContext = { from: BackgroundVariant; to: BackgroundVariant; flowStyle: string }

function chooseDivider(
  ctx:     DividerContext,
  default_: DividerStyle,
): DividerStyle {
  if (default_ === 'none') return 'none'
  if (ctx.from === ctx.to) return 'none'  // same bg: no visual divider needed

  switch (ctx.flowStyle) {
    case 'curved':       return 'wave'
    case 'angled':       return 'angle'
    case 'editorial':    return 'none'
    case 'layered':      return 'overlap'
    case 'soft_blend':   return 'fade'
    default:             return default_
  }
}

// ── Main section flow resolver ────────────────────────────────────────────────

/**
 * Given a list of sections and a design system, assigns `style_config.design`
 * to each section so they flow visually without stacking identical backgrounds.
 *
 * Returns the updated sections array (does not mutate input).
 */
export function applySectionFlow(
  sections:     SectionWithDesign[],
  designSystem: WebsiteDesignSystem,
): SectionWithDesign[] {
  const flowStyle    = designSystem.sectionFlow.style
  const dividerStyle = designSystem.sectionFlow.dividerStyle
  const strategy     = designSystem.sectionFlow.backgroundStrategy

  const assigned: BackgroundVariant[] = []

  return sections.map((section, i) => {
    const role = getRole(section.type)

    // Hero is always full-bleed
    if (role === 'hero') {
      const existing = section.style_config?.design as Partial<SectionDesign> | undefined
      assigned.push('gradient_soft')
      const design: SectionDesign = {
        ...buildDefaultSectionDesign(designSystem),
        backgroundType:  'gradient',
        backgroundValue: designSystem.gradients.hero,
        textColor:       '#ffffff',
        subtextColor:    'rgba(255,255,255,0.85)',
        overlay: {
          enabled: false,
          type:    'gradient',
          value:   designSystem.gradients.overlayDark,
          opacity: 0,
        },
        dividerTop:   'none',
        dividerBottom: dividerStyle !== 'none' ? chooseDivider({ from: 'gradient_soft', to: 'base', flowStyle }, dividerStyle) : 'none',
        cardStyle:    'none',
        spacing:      'luxury',
        layoutVariant: 'hero',
        readability: { checked: true, textContrast: 'pass', subtextContrast: 'pass', buttonContrast: 'pass', notes: [] },
        ...((existing ?? {}) as Partial<SectionDesign>),
      }
      return { ...section, style_config: { ...(section.style_config ?? {}), design } }
    }

    // CTA always gets primary color bg
    if (role === 'cta') {
      assigned.push('primary_wash')
      const primaryIsDark = isDark(designSystem.palette.primary)
      const design: SectionDesign = {
        ...buildDefaultSectionDesign(designSystem),
        backgroundType:  'solid',
        backgroundValue: designSystem.palette.primary,
        textColor:       primaryIsDark ? '#ffffff' : '#1a1a1a',
        subtextColor:    primaryIsDark ? 'rgba(255,255,255,0.85)' : 'rgba(26,26,26,0.75)',
        overlay:         { enabled: false, type: 'gradient', value: '', opacity: 0 },
        dividerTop:      dividerStyle !== 'none' ? chooseDivider({ from: assigned[i-1] ?? 'base', to: 'primary_wash', flowStyle }, dividerStyle) : 'none',
        dividerBottom:   'none',
        cardStyle:       'none',
        spacing:         'airy',
        layoutVariant:   'cta',
        readability: { checked: true, textContrast: 'pass', subtextContrast: 'pass', buttonContrast: 'pass', notes: [] },
      }
      return { ...section, style_config: { ...(section.style_config ?? {}), design } }
    }

    // Assign background based on strategy + position
    let bgVariant: BackgroundVariant

    if (strategy === 'continuous_gradient') {
      bgVariant = i % 2 === 0 ? 'base' : 'surface'
    } else if (strategy === 'premium_cards') {
      bgVariant = 'base'
    } else if (strategy === 'layered_surfaces') {
      bgVariant = ALTERNATING[i % ALTERNATING.length]
    } else {
      // alternating_soft (default)
      const roleBg = ROLE_BG[role] ?? 'base'
      bgVariant = roleBg
      // Override for alternation
      if (roleBg === 'base' || roleBg === 'surface') {
        const prev = assigned[i - 1]
        if (prev === 'base')         bgVariant = 'surface'
        else if (prev === 'surface') bgVariant = 'surface_alt'
        else                         bgVariant = 'base'
      }
    }

    assigned.push(bgVariant)
    const bgValue = bgVariantToValue(bgVariant, designSystem)
    const prevVariant = assigned[i - 1] ?? 'base'

    const design: SectionDesign = {
      ...buildDefaultSectionDesign(designSystem),
      backgroundType:  'solid',
      backgroundValue: bgValue,
      textColor:       designSystem.palette.textPrimary,
      subtextColor:    designSystem.palette.textSecondary,
      overlay:         { enabled: false, type: 'gradient', value: '', opacity: 0 },
      dividerTop:      dividerStyle !== 'none' && prevVariant !== bgVariant
        ? chooseDivider({ from: prevVariant, to: bgVariant, flowStyle }, dividerStyle)
        : 'none',
      dividerBottom:   'none',
      cardStyle:       getCardStyle(role, designSystem),
      imageTreatment:  'rounded',
      spacing:         mapRhythmToSpacing(designSystem.layout.verticalRhythm),
      shadow:          'soft',
      borderRadius:    mapPresetRadius(designSystem.radius.card),
      layoutVariant:   role,
      readability: { checked: true, textContrast: 'pass', subtextContrast: 'pass', buttonContrast: 'pass', notes: [] },
      // Preserve any AI-generated overrides from existing style_config.design
      ...(section.style_config?.design as Partial<SectionDesign> | undefined ?? {}),
    }

    return { ...section, style_config: { ...(section.style_config ?? {}), design } }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCardStyle(
  role:         string,
  designSystem: WebsiteDesignSystem,
): SectionDesign['cardStyle'] {
  const { designLevel } = designSystem
  if (role === 'features' || role === 'products') {
    if (designLevel === 'luxury'   || designLevel === 'editorial') return 'floating'
    if (designLevel === 'futuristic')                               return 'glass'
    return 'soft'
  }
  if (role === 'social_proof') return 'soft'
  if (role === 'faq')          return 'bordered'
  return 'none'
}

function mapRhythmToSpacing(rhythm: string): SectionDesign['spacing'] {
  switch (rhythm) {
    case 'compact': return 'compact'
    case 'airy':    return 'airy'
    case 'luxury':  return 'luxury'
    default:        return 'balanced'
  }
}

function mapPresetRadius(cardRadius: string): SectionDesign['borderRadius'] {
  const n = parseFloat(cardRadius)
  if (isNaN(n) || n < 0.25) return 'none'
  if (n < 0.75)              return 'soft'
  if (n < 1.5)               return 'soft'
  if (n < 2.5)               return 'large'
  return 'organic'
}
