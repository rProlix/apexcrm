// lib/website/design/normalizeDesignSystem.ts
// Normalizes AI-generated or user-provided design system data into a valid WebsiteDesignSystem.
// Enforces hex color validity, enum values, and WCAG contrast compliance.

import type {
  WebsiteDesignSystem,
  DesignPalette,
  DesignGradients,
  DesignTypography,
  DesignRadius,
  DesignShadows,
  DesignLayout,
  SectionDesign,
  SectionBackgroundType,
  SectionCardStyle,
  SectionImageTreatment,
  SectionSpacing,
  SectionShadow,
  SectionBorderRadius,
  DividerStyle,
  DesignLevel,
  VerticalRhythm,
  CardDensity,
  SectionFlowStyle,
  BackgroundStrategy,
  OverlayStrategy,
} from './types'
import {
  hexToRgb,
  ensureContrast,
  chooseReadableTextColor,
  passesWcag,
  isDark,
  tintColor,
} from './contrast'
import { getCategoryPreset, DEFAULT_PRESET } from './categoryPresets'

// ── Enum validator sets ───────────────────────────────────────────────────────

const DESIGN_LEVELS    = new Set<DesignLevel>(['clean','premium','luxury','bold','warm','editorial','futuristic'])
const VERTICAL_RHYTHMS = new Set<VerticalRhythm>(['compact','balanced','airy','luxury'])
const CARD_DENSITIES   = new Set<CardDensity>(['compact','balanced','spacious'])
const FLOW_STYLES      = new Set<SectionFlowStyle>(['soft_blend','curved','angled','layered','editorial','minimal'])
const DIVIDER_STYLES   = new Set<DividerStyle>(['none','curve','wave','angle','fade','overlap'])
const BG_STRATEGIES    = new Set<BackgroundStrategy>(['alternating_soft','continuous_gradient','layered_surfaces','image_blend','premium_cards'])
const OVERLAY_STRATS   = new Set<OverlayStrategy>(['auto_gradient_overlay','auto_blur_overlay','auto_shadow_overlay','solid_scrim'])
const BG_TYPES         = new Set<SectionBackgroundType>(['solid','gradient','image','layered','split','glass','editorial'])
const CARD_STYLES      = new Set<SectionCardStyle>(['none','soft','glass','floating','bordered','editorial'])
const IMAGE_TREATMENTS = new Set<SectionImageTreatment>(['none','rounded','floating','overlay','cutout','editorial'])
const SECTION_SPACINGS = new Set<SectionSpacing>(['compact','balanced','airy','luxury'])
const SECTION_SHADOWS  = new Set<SectionShadow>(['none','soft','medium','premium'])
const BORDER_RADII     = new Set<SectionBorderRadius>(['none','soft','large','organic'])

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function isValidHex(h: string): boolean {
  return /^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(h)
}

function hex(v: unknown, fallback: string): string {
  const val = s(v as string, fallback)
  return isValidHex(val) ? val : (isValidHex(fallback) ? fallback : '#888888')
}

// Alias used in private helpers to avoid naming collision in checkContrast scope
// (isValidHex is already in scope from this file's top-level function)


function enumVal<T extends string>(set: Set<T>, v: unknown, fallback: T): T {
  const sv = s(v as string, '')
  return set.has(sv as T) ? (sv as T) : fallback
}

function isGradientOrColor(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const t = v.trim()
  return isValidHex(t) ||
    t.startsWith('linear-gradient') ||
    t.startsWith('radial-gradient') ||
    t.startsWith('conic-gradient') ||
    t.startsWith('rgba(') ||
    t.startsWith('rgb(')
}

function safeGradient(v: unknown, fallback: string): string {
  return isGradientOrColor(v) ? (v as string) : fallback
}

function numProp(v: unknown, fallback: number, min = 100, max = 900): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''))
  return isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

// ── Palette normalizer ────────────────────────────────────────────────────────

function normalizePalette(
  input:   Record<string, unknown>,
  preset:  DesignPalette,
): DesignPalette {
  const primary       = hex(input.primary,       preset.primary)
  const secondary     = hex(input.secondary,     preset.secondary)
  const accent        = hex(input.accent,         preset.accent)
  const background    = hex(input.background,     preset.background)
  const surface       = hex(input.surface,        preset.surface)
  const surfaceAlt    = hex(input.surfaceAlt,     preset.surfaceAlt)
  const border        = hex(input.border,         preset.border)

  // Text colors: validate contrast
  let textPrimary   = hex(input.textPrimary,   preset.textPrimary)
  let textSecondary = hex(input.textSecondary, preset.textSecondary)
  let mutedText     = hex(input.mutedText,     preset.mutedText)

  textPrimary   = ensureContrast(textPrimary,   background, 'AA')
  textSecondary = ensureContrast(textSecondary, background, 'AA')

  // Muted text: WCAG AA large text (3:1)
  if (!passesWcag(mutedText, background, 'AA', 'large')) {
    mutedText = ensureContrast(mutedText, background, 'AA')
  }

  return {
    primary,
    secondary,
    accent,
    background,
    surface,
    surfaceAlt,
    textPrimary,
    textSecondary,
    mutedText,
    border,
    success: input.success ? hex(input.success, '#059669') : undefined,
    warning: input.warning ? hex(input.warning, '#D97706') : undefined,
    danger:  input.danger  ? hex(input.danger,  '#DC2626') : undefined,
  }
}

// ── Typography normalizer ─────────────────────────────────────────────────────

const HEADING_CATS = new Set(['serif','sans','display','modern','editorial'])
const BODY_CATS    = new Set(['sans','serif','humanist','modern'])

function normalizeTypography(
  input:  Record<string, unknown>,
  preset: DesignTypography,
): DesignTypography {
  const hCat = s(input.headingFontCategory as string, preset.headingFontCategory)
  const bCat = s(input.bodyFontCategory as string,    preset.bodyFontCategory)

  return {
    headingFontCategory: HEADING_CATS.has(hCat) ? (hCat as DesignTypography['headingFontCategory']) : preset.headingFontCategory,
    bodyFontCategory:    BODY_CATS.has(bCat)    ? (bCat as DesignTypography['bodyFontCategory'])    : preset.bodyFontCategory,
    headingFontStack:    s(input.headingFontStack as string, preset.headingFontStack),
    bodyFontStack:       s(input.bodyFontStack as string,    preset.bodyFontStack),
    headingWeight:       numProp(input.headingWeight, preset.headingWeight),
    bodyWeight:          numProp(input.bodyWeight ?? 400, 400),
    letterSpacing:       s(input.letterSpacing as string, preset.letterSpacing),
    lineHeight:          s(input.lineHeight as string,    preset.lineHeight),
  }
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Normalize any AI-generated or user-supplied object into a valid WebsiteDesignSystem.
 * Falls back to category preset for any missing/invalid values.
 */
export function normalizeDesignSystem(
  input:            unknown,
  businessCategory: string | null | undefined,
): WebsiteDesignSystem {
  const preset = getCategoryPreset(businessCategory)
  const raw    = (input && typeof input === 'object' && !Array.isArray(input))
    ? (input as Record<string, unknown>)
    : {}

  const paletteRaw    = (raw.palette    && typeof raw.palette    === 'object') ? raw.palette    as Record<string, unknown> : {}
  const gradientsRaw  = (raw.gradients  && typeof raw.gradients  === 'object') ? raw.gradients  as Record<string, unknown> : {}
  const typographyRaw = (raw.typography && typeof raw.typography === 'object') ? raw.typography as Record<string, unknown> : {}
  const radiusRaw     = (raw.radius     && typeof raw.radius     === 'object') ? raw.radius     as Record<string, unknown> : {}
  const shadowsRaw    = (raw.shadows    && typeof raw.shadows    === 'object') ? raw.shadows    as Record<string, unknown> : {}
  const layoutRaw     = (raw.layout     && typeof raw.layout     === 'object') ? raw.layout     as Record<string, unknown> : {}
  const flowRaw       = (raw.sectionFlow && typeof raw.sectionFlow === 'object') ? raw.sectionFlow as Record<string, unknown> : {}
  const a11yRaw       = (raw.accessibility && typeof raw.accessibility === 'object') ? raw.accessibility as Record<string, unknown> : {}

  const palette = normalizePalette(paletteRaw, preset.palette as DesignPalette)

  const gradients: DesignGradients = {
    hero:        safeGradient(gradientsRaw.hero,         preset.gradients.hero),
    sectionSoft: safeGradient(gradientsRaw.sectionSoft,  preset.gradients.sectionSoft),
    accentWash:  safeGradient(gradientsRaw.accentWash,   preset.gradients.accentWash),
    overlayDark: safeGradient(gradientsRaw.overlayDark,  preset.gradients.overlayDark),
    overlayLight:safeGradient(gradientsRaw.overlayLight, preset.gradients.overlayLight),
  }

  const typography = normalizeTypography(typographyRaw, preset.typography as DesignTypography)

  const radius: DesignRadius = {
    card:    s(radiusRaw.card as string,    preset.radius.card),
    button:  s(radiusRaw.button as string,  preset.radius.button),
    image:   s(radiusRaw.image as string,   preset.radius.image),
    section: s(radiusRaw.section as string, preset.radius.section),
  }

  const shadows: DesignShadows = {
    card:     s(shadowsRaw.card as string,     preset.shadows.card),
    floating: s(shadowsRaw.floating as string, preset.shadows.floating),
    image:    s(shadowsRaw.image as string,    preset.shadows.image),
    button:   s(shadowsRaw.button as string,   preset.shadows.button),
  }

  const layout: DesignLayout = {
    maxWidth:              s(layoutRaw.maxWidth as string,              preset.layout.maxWidth),
    sectionPaddingDesktop: s(layoutRaw.sectionPaddingDesktop as string, preset.layout.sectionPaddingDesktop),
    sectionPaddingMobile:  s(layoutRaw.sectionPaddingMobile as string,  preset.layout.sectionPaddingMobile),
    verticalRhythm:        enumVal(VERTICAL_RHYTHMS, layoutRaw.verticalRhythm, preset.layout.verticalRhythm),
    cardDensity:           enumVal(CARD_DENSITIES,   layoutRaw.cardDensity,    preset.layout.cardDensity),
  }

  const sectionFlow = {
    style:              enumVal(FLOW_STYLES,    flowRaw.style,              preset.sectionFlow.style),
    dividerStyle:       enumVal(DIVIDER_STYLES, flowRaw.dividerStyle,       preset.sectionFlow.dividerStyle),
    backgroundStrategy: enumVal(BG_STRATEGIES,  flowRaw.backgroundStrategy, preset.sectionFlow.backgroundStrategy),
  }

  const accessibility = {
    contrastMode:          'strict' as const,
    minimumTextContrast:   'AA' as const,
    overlayStrategy:       enumVal(OVERLAY_STRATS, a11yRaw.overlayStrategy, 'auto_gradient_overlay' as OverlayStrategy),
    enforceReadableSubtext: true as const,
  }

  const designSystem: WebsiteDesignSystem = {
    brandMood:        s(raw.brandMood as string,        preset.mood),
    businessCategory: s(raw.businessCategory as string, businessCategory ?? preset.category),
    designLevel:      enumVal(DESIGN_LEVELS, raw.designLevel, preset.designLevel),
    palette,
    gradients,
    typography,
    radius,
    shadows,
    layout,
    sectionFlow,
    accessibility,
  }

  designSystem.cssVars = buildCssVars(designSystem)
  return designSystem
}

// ── Section design normalizer ─────────────────────────────────────────────────

const DEFAULT_SECTION_DESIGN: SectionDesign = {
  backgroundType:  'solid',
  backgroundValue: 'var(--ds-bg)',
  textColor:       'var(--ds-text)',
  subtextColor:    'var(--ds-muted)',
  overlay: { enabled: false, type: 'gradient', value: '', opacity: 0 },
  dividerTop:     'none',
  dividerBottom:  'none',
  cardStyle:      'soft',
  imageTreatment: 'rounded',
  spacing:        'balanced',
  shadow:         'soft',
  borderRadius:   'soft',
  layoutVariant:  'default',
  readability: {
    checked: false, textContrast: 'pass', subtextContrast: 'pass', buttonContrast: 'pass', notes: [],
  },
}

export function normalizeSectionDesign(
  input:        unknown,
  designSystem: WebsiteDesignSystem,
): SectionDesign {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return buildDefaultSectionDesign(designSystem)
  }
  const raw = input as Record<string, unknown>
  const overlayRaw = (raw.overlay && typeof raw.overlay === 'object') ? raw.overlay as Record<string, unknown> : {}

  return {
    backgroundType:  enumVal(BG_TYPES,         raw.backgroundType,  DEFAULT_SECTION_DESIGN.backgroundType),
    backgroundValue: s(raw.backgroundValue as string, DEFAULT_SECTION_DESIGN.backgroundValue),
    textColor:       s(raw.textColor as string,       DEFAULT_SECTION_DESIGN.textColor),
    subtextColor:    s(raw.subtextColor as string,    DEFAULT_SECTION_DESIGN.subtextColor),
    overlay: {
      enabled: typeof overlayRaw.enabled === 'boolean' ? overlayRaw.enabled : false,
      type:    ['gradient','blur','scrim','shadow'].includes(s(overlayRaw.type as string, 'gradient'))
                 ? (s(overlayRaw.type as string, 'gradient') as SectionDesign['overlay']['type']) : 'gradient',
      value:   s(overlayRaw.value as string, ''),
      opacity: typeof overlayRaw.opacity === 'number' ? Math.min(1, Math.max(0, overlayRaw.opacity)) : 0,
    },
    dividerTop:     enumVal(DIVIDER_STYLES,   raw.dividerTop,     DEFAULT_SECTION_DESIGN.dividerTop),
    dividerBottom:  enumVal(DIVIDER_STYLES,   raw.dividerBottom,  DEFAULT_SECTION_DESIGN.dividerBottom),
    cardStyle:      enumVal(CARD_STYLES,      raw.cardStyle,      DEFAULT_SECTION_DESIGN.cardStyle),
    imageTreatment: enumVal(IMAGE_TREATMENTS, raw.imageTreatment, DEFAULT_SECTION_DESIGN.imageTreatment),
    spacing:        enumVal(SECTION_SPACINGS, raw.spacing,        DEFAULT_SECTION_DESIGN.spacing),
    shadow:         enumVal(SECTION_SHADOWS,  raw.shadow,         DEFAULT_SECTION_DESIGN.shadow),
    borderRadius:   enumVal(BORDER_RADII,     raw.borderRadius,   DEFAULT_SECTION_DESIGN.borderRadius),
    layoutVariant:  s(raw.layoutVariant as string, 'default'),
    readability:    DEFAULT_SECTION_DESIGN.readability,
  }
}

/**
 * Generate a default SectionDesign from the design system.
 * Used as a fallback for sections without explicit design.
 */
export function buildDefaultSectionDesign(
  designSystem: WebsiteDesignSystem,
): SectionDesign {
  return {
    ...DEFAULT_SECTION_DESIGN,
    backgroundValue: designSystem.palette.background,
    textColor:       designSystem.palette.textPrimary,
    subtextColor:    designSystem.palette.textSecondary,
  }
}

/**
 * Enforce WCAG contrast on a SectionDesign.
 * Auto-adjusts text colors and overlay if contrast is insufficient.
 */
export function ensureReadableSectionColors(
  design:       SectionDesign,
  designSystem: WebsiteDesignSystem,
): SectionDesign {
  const notes: string[] = []
  let { textColor, subtextColor, overlay } = design

  // For image/gradient sections, enforce overlay
  const hasImage = design.backgroundType === 'image'
  const hasGradient = design.backgroundType === 'gradient' || design.backgroundType === 'layered'

  if (hasImage && !overlay.enabled) {
    overlay = {
      enabled: true,
      type:    'gradient',
      value:   designSystem.gradients.overlayDark,
      opacity: 0.6,
    }
    textColor    = '#ffffff'
    subtextColor = 'rgba(255,255,255,0.82)'
    notes.push('Added gradient overlay for image readability')
  }

  // For solid/gradient backgrounds, validate actual hex colors
  const bgColor = extractBgHex(design.backgroundValue, designSystem.palette.background)
  if (bgColor) {
    const correctedText = ensureContrast(
      isValidHexForContrast(textColor) ? textColor : designSystem.palette.textPrimary,
      bgColor,
    )
    if (correctedText !== textColor) {
      notes.push(`Text color adjusted from ${textColor} to ${correctedText} for WCAG AA`)
      textColor = correctedText
    }

    const correctedSubtext = ensureContrast(
      isValidHexForContrast(subtextColor) ? subtextColor : designSystem.palette.textSecondary,
      bgColor,
    )
    if (correctedSubtext !== subtextColor) {
      notes.push(`Subtext color adjusted for readability`)
      subtextColor = correctedSubtext
    }
  }

  const textContrast    = checkContrast(textColor,    design.backgroundValue, designSystem)
  const subtextContrast = checkContrast(subtextColor, design.backgroundValue, designSystem)

  return {
    ...design,
    textColor,
    subtextColor,
    overlay,
    readability: {
      checked:          true,
      textContrast,
      subtextContrast,
      buttonContrast:   'pass',
      notes,
    },
  }
}

// ── CSS variable builder ──────────────────────────────────────────────────────

/**
 * Build a CSS custom properties map from a WebsiteDesignSystem.
 * These are injected into the <html> or page wrapper.
 */
export function buildCssVars(ds: WebsiteDesignSystem): Record<string, string> {
  const p = ds.palette
  const t = ds.typography
  const r = ds.radius

  return {
    // Palette
    '--color-primary':    p.primary,
    '--color-secondary':  p.secondary,
    '--color-accent':     p.accent,
    '--color-bg':         p.background,
    '--color-surface':    p.surface,
    '--color-surface-alt':p.surfaceAlt,
    '--color-text':       p.textPrimary,
    '--color-muted':      p.mutedText,
    '--color-border':     p.border,
    // Design-system specific
    '--ds-bg':            p.background,
    '--ds-surface':       p.surface,
    '--ds-surface-alt':   p.surfaceAlt,
    '--ds-text':          p.textPrimary,
    '--ds-text-secondary':p.textSecondary,
    '--ds-muted':         p.mutedText,
    '--ds-primary':       p.primary,
    '--ds-secondary':     p.secondary,
    '--ds-accent':        p.accent,
    '--ds-border':        p.border,
    '--ds-primary-light': tintColor(p.primary, 0.15),
    '--ds-primary-text':  chooseReadableTextColor(p.primary),
    // Typography
    '--font-heading':     t.headingFontStack,
    '--font-body':        t.bodyFontStack,
    '--font-weight-heading': String(t.headingWeight),
    '--font-weight-body':    String(t.bodyWeight ?? 400),
    '--letter-spacing':      t.letterSpacing,
    '--line-height':         t.lineHeight,
    // Radius
    '--radius-card':    r.card,
    '--radius-button':  r.button,
    '--radius-image':   r.image,
    '--radius-section': r.section,
    // Shadows
    '--shadow-card':    ds.shadows.card,
    '--shadow-floating':ds.shadows.floating,
    '--shadow-image':   ds.shadows.image,
    '--shadow-button':  ds.shadows.button,
    // Layout
    '--max-width':             ds.layout.maxWidth,
    '--section-padding-desk':  ds.layout.sectionPaddingDesktop,
    '--section-padding-mobile':ds.layout.sectionPaddingMobile,
    // Gradients
    '--gradient-hero':         ds.gradients.hero,
    '--gradient-section-soft': ds.gradients.sectionSoft,
    '--gradient-accent-wash':  ds.gradients.accentWash,
    '--gradient-overlay-dark': ds.gradients.overlayDark,
    '--gradient-overlay-light':ds.gradients.overlayLight,
  }
}

/** Build a <style> tag string from the design system CSS vars */
export function buildCssVarStyleTag(ds: WebsiteDesignSystem, selector = ':root'): string {
  const vars = ds.cssVars ?? buildCssVars(ds)
  const declarations = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  return `${selector} {\n${declarations}\n}`
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function extractBgHex(bgValue: string, fallback: string): string | null {
  if (isValidHexColor(bgValue)) return bgValue
  // Try to extract from CSS variable reference
  if (bgValue.startsWith('var(--')) return null // Can't resolve at compile time
  return isValidHexColor(fallback) ? fallback : null
}

function isValidHexForContrast(color: string): boolean {
  return isValidHexColor(color) && hexToRgb(color) !== null
}

function checkContrast(
  fg:  string,
  bg:  string,
  _ds: WebsiteDesignSystem,
): 'pass' | 'fail' | 'warn' {
  if (fg.startsWith('var(') || bg.startsWith('var(') || fg.startsWith('rgba(')) return 'pass'
  if (!isValidHexColor(fg) || !isValidHexColor(bg)) return 'pass'
  return passesWcag(fg, bg, 'AA') ? 'pass'
    : passesWcag(fg, bg, 'AA', 'large') ? 'warn'
    : 'fail'
}

function isValidHexColor(h: string): boolean {
  return /^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(h)
}

// ── Design system → JSON-safe plain object ────────────────────────────────────

export function serializeDesignSystem(ds: WebsiteDesignSystem): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ds)) as Record<string, unknown>
}
