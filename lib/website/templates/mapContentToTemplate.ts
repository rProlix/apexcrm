// lib/website/templates/mapContentToTemplate.ts
// Maps a tenant's existing website sections to template slots.
// Content is never overwritten — it is slotted into the new layout.

import type { TemplateSectionBlueprint } from './templateTypes'

export interface ExistingSection {
  id:           string
  section_type: string
  template_slot?: string | null
  content:      Record<string, unknown>
  sort_order:   number | null
  is_visible:   boolean
  style_config?: Record<string, unknown> | null
  animation_config?: Record<string, unknown> | null
}

export interface SlotMapping {
  blueprint:  TemplateSectionBlueprint
  /** The matched existing section, or null if none found */
  existing:   ExistingSection | null
  /** Whether a new placeholder section should be created */
  shouldCreate: boolean
}

/**
 * Match existing sections to template slots by section_type.
 * Each section_type is used at most once (first-match wins).
 * Multiple sections of the same type are grouped and the first used.
 */
export function mapContentToTemplate(
  existingSections:  ExistingSection[],
  blueprints:        TemplateSectionBlueprint[],
): SlotMapping[] {
  const usedIds = new Set<string>()

  // Group existing sections by section_type
  const byType: Record<string, ExistingSection[]> = {}
  for (const s of existingSections) {
    if (!byType[s.section_type]) byType[s.section_type] = []
    byType[s.section_type].push(s)
  }

  const typePickCursor: Record<string, number> = {}

  return blueprints
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((bp): SlotMapping => {
      const candidates = byType[bp.sectionType] ?? []
      const cursor     = typePickCursor[bp.sectionType] ?? 0
      let matched: ExistingSection | null = null

      // Find the next unused candidate of this type
      for (let i = cursor; i < candidates.length; i++) {
        if (!usedIds.has(candidates[i].id)) {
          matched = candidates[i]
          usedIds.add(candidates[i].id)
          typePickCursor[bp.sectionType] = i + 1
          break
        }
      }

      return {
        blueprint:    bp,
        existing:     matched,
        shouldCreate: !matched && bp.required,
      }
    })
}

/**
 * Build the default content for a new placeholder section.
 * Used when a template requires a section that doesn't exist yet.
 */
export function buildPlaceholderContent(
  sectionType: string,
  blueprint:   TemplateSectionBlueprint,
): Record<string, unknown> {
  const base = blueprint.defaultContent ?? {}

  switch (sectionType) {
    case 'hero':
      return {
        headline:    'Welcome — Update This Headline',
        subheadline: 'Add your business tagline here',
        ctaLabel:    'Get Started',
        ctaHref:     '/shop',
        ...base,
      }
    case 'feature_grid':
      return {
        headline: 'Our Services',
        items:    [
          { title: 'Service 1', description: 'Describe your service here.', icon: '⭐' },
          { title: 'Service 2', description: 'Describe your service here.', icon: '✓' },
          { title: 'Service 3', description: 'Describe your service here.', icon: '💎' },
        ],
        ...base,
      }
    case 'testimonials':
      return {
        headline: 'What Our Customers Say',
        items:    [
          { name: 'Happy Customer', quote: 'Add your customer reviews here.', rating: 5 },
        ],
        ...base,
      }
    case 'faq':
      return {
        headline: 'Frequently Asked Questions',
        items:    [
          { question: 'What services do you offer?', answer: 'Describe your services here.' },
          { question: 'How do I get started?', answer: 'Contact us or book online.' },
        ],
        ...base,
      }
    case 'cta':
      return {
        headline:    'Ready to Get Started?',
        subheadline: 'Contact us today',
        ctaLabel:    'Book Now',
        ctaHref:     '/book',
        ...base,
      }
    case 'contact':
      return {
        headline: 'Contact Us',
        ...base,
      }
    case 'about':
      return {
        headline:    'About Us',
        description: 'Tell your story here.',
        ...base,
      }
    default:
      return base
  }
}
