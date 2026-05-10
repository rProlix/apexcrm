// lib/website/sectionRegistry.ts
//
// Maps every canonical section type to the React component that renders it.
// This is the single source of truth — no other file should do its own switch.
//
// Rules:
//  - Keys must be CanonicalSectionType values from normalizeWebsiteSection.ts
//  - Components are imported directly (server-component-safe)
//  - Client-only components are wrapped in a lazy client wrapper

import type { CanonicalSectionType, NormalizedSection } from './normalizeWebsiteSection'

export type SectionRendererComponent = (props: {
  section: NormalizedSection
  tenantId: string
}) => React.ReactNode | Promise<React.ReactNode>

// The registry is lazily populated to avoid circular imports at module-load time.
// Use getSectionRenderer() to look up entries at render time.

/**
 * Returns the renderer for a canonical section type, or null if unknown.
 * Import the actual components lazily from here so we can keep this module
 * free of async imports at the top level (some renderers are server components).
 */
export function getSectionRendererType(
  type: CanonicalSectionType,
): string | null {
  const MAP: Partial<Record<CanonicalSectionType, string>> = {
    hero:         'hero',
    about:        'about',
    feature_grid: 'feature_grid',
    testimonials: 'testimonials',
    faq:          'faq',
    contact:      'contact',
    product_grid: 'product_grid',
    rich_text:    'rich_text',
    banner:       'banner',
    cta:          'cta',
    gallery:      'gallery',
    product_360:  'product_360',
  }
  return MAP[type] ?? null
}

/**
 * Returns true when we have a registered renderer for this type.
 * Used by the debug endpoint.
 */
export function hasRenderer(type: CanonicalSectionType): boolean {
  return getSectionRendererType(type) !== null
}
