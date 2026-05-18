// lib/website/design/types.ts
// TypeScript types for the premium design system used in AI autofill and section rendering.

export type DesignLevel = 'clean' | 'premium' | 'luxury' | 'bold' | 'warm' | 'editorial' | 'futuristic'

export type VerticalRhythm = 'compact' | 'balanced' | 'airy' | 'luxury'
export type CardDensity     = 'compact' | 'balanced' | 'spacious'
export type SectionFlowStyle = 'soft_blend' | 'curved' | 'angled' | 'layered' | 'editorial' | 'minimal'
export type DividerStyle     = 'none' | 'curve' | 'wave' | 'angle' | 'fade' | 'overlap'
export type BackgroundStrategy =
  | 'alternating_soft'
  | 'continuous_gradient'
  | 'layered_surfaces'
  | 'image_blend'
  | 'premium_cards'

export type OverlayStrategy =
  | 'auto_gradient_overlay'
  | 'auto_blur_overlay'
  | 'auto_shadow_overlay'
  | 'solid_scrim'

export interface DesignPalette {
  primary:       string
  secondary:     string
  accent:        string
  background:    string
  surface:       string
  surfaceAlt:    string
  textPrimary:   string
  textSecondary: string
  mutedText:     string
  border:        string
  success?:      string
  warning?:      string
  danger?:       string
}

export interface DesignGradients {
  hero:        string
  sectionSoft: string
  accentWash:  string
  overlayDark: string
  overlayLight: string
}

export interface DesignTypography {
  headingFontCategory: 'serif' | 'sans' | 'display' | 'modern' | 'editorial'
  bodyFontCategory:    'sans' | 'serif' | 'humanist' | 'modern'
  headingFontStack:    string
  bodyFontStack:       string
  headingWeight:       number
  bodyWeight:          number
  letterSpacing:       string
  lineHeight:          string
}

export interface DesignRadius {
  card:    string
  button:  string
  image:   string
  section: string
}

export interface DesignShadows {
  card:     string
  floating: string
  image:    string
  button:   string
}

export interface DesignLayout {
  maxWidth:             string
  sectionPaddingDesktop: string
  sectionPaddingMobile:  string
  verticalRhythm:        VerticalRhythm
  cardDensity:           CardDensity
}

export interface WebsiteDesignSystem {
  brandMood:        string
  businessCategory: string
  designLevel:      DesignLevel
  palette:          DesignPalette
  gradients:        DesignGradients
  typography:       DesignTypography
  radius:           DesignRadius
  shadows:          DesignShadows
  layout:           DesignLayout
  sectionFlow: {
    style:              SectionFlowStyle
    dividerStyle:       DividerStyle
    backgroundStrategy: BackgroundStrategy
  }
  accessibility: {
    contrastMode:          'strict'
    minimumTextContrast:   'AA'
    overlayStrategy:       OverlayStrategy
    enforceReadableSubtext: true
  }
  /** CSS custom properties derived from palette + typography */
  cssVars?: Record<string, string>
}

// ── Section-level design ──────────────────────────────────────────────────────

export type SectionBackgroundType =
  | 'solid'
  | 'gradient'
  | 'image'
  | 'layered'
  | 'split'
  | 'glass'
  | 'editorial'

export type SectionCardStyle   = 'none' | 'soft' | 'glass' | 'floating' | 'bordered' | 'editorial'
export type SectionImageTreatment = 'none' | 'rounded' | 'floating' | 'overlay' | 'cutout' | 'editorial'
export type SectionSpacing     = 'compact' | 'balanced' | 'airy' | 'luxury'
export type SectionShadow      = 'none' | 'soft' | 'medium' | 'premium'
export type SectionBorderRadius = 'none' | 'soft' | 'large' | 'organic'

export interface SectionDesign {
  backgroundType:  SectionBackgroundType
  backgroundValue: string
  textColor:       string
  subtextColor:    string
  overlay: {
    enabled: boolean
    type:    'gradient' | 'blur' | 'scrim' | 'shadow'
    value:   string
    opacity: number
  }
  dividerTop:     DividerStyle
  dividerBottom:  DividerStyle
  cardStyle:      SectionCardStyle
  imageTreatment: SectionImageTreatment
  spacing:        SectionSpacing
  shadow:         SectionShadow
  borderRadius:   SectionBorderRadius
  layoutVariant:  string
  readability: {
    checked:          boolean
    textContrast:     'pass' | 'fail' | 'warn'
    subtextContrast:  'pass' | 'fail' | 'warn'
    buttonContrast:   'pass' | 'fail' | 'warn'
    notes:            string[]
  }
}

/** Section `style_config` shape that wraps SectionDesign */
export interface SectionStyleConfig {
  design?: Partial<SectionDesign>
  [key: string]: unknown
}

// ── Category preset shape ─────────────────────────────────────────────────────

export interface CategoryPreset {
  category:         string
  aliases:          string[]
  mood:             string
  designLevel:      DesignLevel
  palette: Pick<DesignPalette, 'primary' | 'secondary' | 'accent' | 'background' | 'surface' | 'surfaceAlt' | 'textPrimary' | 'textSecondary' | 'mutedText' | 'border'>
  gradients:        DesignGradients
  typography: Pick<DesignTypography, 'headingFontCategory' | 'bodyFontCategory' | 'headingFontStack' | 'bodyFontStack' | 'headingWeight' | 'letterSpacing' | 'lineHeight'>
  radius:           DesignRadius
  shadows:          DesignShadows
  layout:           DesignLayout
  sectionFlow: {
    style:              SectionFlowStyle
    dividerStyle:       DividerStyle
    backgroundStrategy: BackgroundStrategy
  }
}

/** Map from design CSS var names to values */
export type DesignCssVars = Record<string, string>
