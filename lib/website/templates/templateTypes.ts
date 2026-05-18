// lib/website/templates/templateTypes.ts
// Type definitions for the premium website template system.

import type { WebsiteDesignSystem, SectionDesign } from '@/lib/website/design/types'

// ── Template metadata ─────────────────────────────────────────────────────────

export type TemplateLayoutType =
  | 'standard'
  | 'one_page'
  | 'product_story'
  | 'parallax'
  | 'promo'
  | 'editorial'
  | 'minimal'

export type TemplateAnimationLevel = 'none' | 'subtle' | 'balanced' | 'cinematic'

export type TemplateCategory =
  | 'restaurant'
  | 'retail'
  | 'beauty'
  | 'automotive'
  | 'law'
  | 'medical'
  | 'saas'
  | 'local_service'
  | 'promo'
  | 'luxury'
  | 'one_page'
  | 'product_showcase'
  | 'general'

/** A section slot definition inside a template blueprint */
export interface TemplateSectionBlueprint {
  /** Slot identifier — matches section_type or a custom key */
  slot:        string
  /** DB section_type to use */
  sectionType: string
  /** Whether this slot is required */
  required:    boolean
  /** Sort order within the template layout */
  order:       number
  /** Design overrides for this slot */
  design:      Partial<SectionDesign>
  /** Default content if no existing section maps to this slot */
  defaultContent?: Record<string, unknown>
  /** Layout variant name */
  layoutVariant?: string
  /** Visual intent description */
  visualIntent?: string
}

/** The full template definition (code-side) */
export interface WebsiteTemplate {
  key:            string
  name:           string
  description:    string
  category:       TemplateCategory
  layoutType:     TemplateLayoutType
  animationLevel: TemplateAnimationLevel
  tags:           string[]
  /** Brief feature list */
  features:       string[]
  /** Who this template is best for */
  bestFor:        string[]
  /** Design system for this template */
  designSystem:   Partial<WebsiteDesignSystem>
  /** Ordered section blueprint */
  sectionBlueprints: TemplateSectionBlueprint[]
  /** Gradient used for thumbnail preview */
  previewGradient: string
  /** Emoji or icon for the template card */
  icon:           string
}

// ── Template application options ──────────────────────────────────────────────

export interface TemplateApplyOptions {
  tenantId:             string
  templateKey:          string
  preserveBrand:        boolean
  preserveImages:       boolean
  generateMissingImages: boolean
  applyAnimations:      boolean
  pageId?:              string | null
}

// ── Template render data ──────────────────────────────────────────────────────

export interface TemplateRenderData {
  templateKey:       string
  layoutType:        TemplateLayoutType
  designSystem:      WebsiteDesignSystem
  activeTemplateKey: string | null
  templateConfig:    Record<string, unknown>
}

// ── Section mapping result ────────────────────────────────────────────────────

export interface MappedSection {
  id:            string
  section_type:  string
  template_slot: string
  sort_order:    number
  content:       Record<string, unknown>
  style_config:  Record<string, unknown>
  animation_config?: Record<string, unknown> | null
  is_visible:    boolean
  isNew:         boolean
}
