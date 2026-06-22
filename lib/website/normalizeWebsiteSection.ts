// lib/website/normalizeWebsiteSection.ts
//
// Central normalizer that converts raw Supabase section rows into a clean,
// safe, type-safe shape before they are passed to any renderer.
//
// Key guarantees:
//  - Never throws, no matter how malformed the input is
//  - Understands all legacy and current field names
//  - Normalizes section_type aliases to canonical values
//  - Defaults content/config to {} so components never receive null
//  - isVisible defaults to true unless explicitly false

export type CanonicalSectionType =
  | 'hero'
  | 'about'
  | 'feature_grid'
  | 'testimonials'
  | 'faq'
  | 'contact'
  | 'product_grid'
  | 'rich_text'
  | 'banner'
  | 'cta'
  | 'gallery'
  | 'product_360'
  | 'premium_3d_scroll_hero'
  | 'unknown'

export interface NormalizedSection {
  /** DB primary key */
  id:         string
  /** Canonical section type used by the registry */
  type:       CanonicalSectionType
  /** The raw value stored in the database (for debugging) */
  rawType:    string
  /** The page_id this section belongs to */
  pageId:     string
  /** Content object — never null, always a plain object */
  content:    Record<string, unknown>
  /** Config/settings object — never null */
  config:     Record<string, unknown>
  /** Style overrides — never null */
  styles:     Record<string, unknown>
  /** Sort position */
  sortOrder:  number
  /** Whether the section should be rendered publicly */
  isVisible:  boolean
  /** Status stored in DB */
  status:     string
  /** Reference to the original raw row (for editor use) */
  raw:        Record<string, unknown>
}

// ── Type alias map ────────────────────────────────────────────────────────────
// Maps every possible stored string to a canonical type.

const TYPE_ALIASES: Record<string, CanonicalSectionType> = {
  // ── Hero ──
  hero:         'hero',
  hero_banner:  'hero',
  hero_banners: 'hero',
  'hero banner':  'hero',
  herobanner:   'hero',
  'hero-banner':  'hero',
  banner_hero:  'hero',
  landing_hero: 'hero',

  // ── About ──
  about:           'about',
  about_section:   'about',
  'about section': 'about',
  aboutsection:    'about',
  'about-section': 'about',
  business_about:  'about',

  // ── Feature Grid ──
  feature_grid:     'feature_grid',
  features:         'feature_grid',
  feature:          'feature_grid',
  'feature grid':   'feature_grid',
  featuregrid:      'feature_grid',
  'feature-grid':   'feature_grid',
  services:         'feature_grid',
  service_grid:     'feature_grid',
  modules_grid:     'feature_grid',
  highlights:       'feature_grid',

  // ── Testimonials ──
  testimonials:        'testimonials',
  testimonial:         'testimonials',
  testimonial_section: 'testimonials',
  reviews:             'testimonials',
  review_grid:         'testimonials',
  customer_reviews:    'testimonials',

  // ── FAQ ──
  faq:               'faq',
  faqs:              'faq',
  faq_section:       'faq',
  questions:         'faq',
  common_questions:  'faq',

  // ── Contact ──
  contact:          'contact',
  contact_section:  'contact',
  'contact section': 'contact',
  contactsection:   'contact',
  'contact-section': 'contact',
  contact_form:     'contact',
  business_contact: 'contact',

  // ── Product Grid ──
  product_grid:     'product_grid',
  products:         'product_grid',
  store:            'product_grid',
  shop:             'product_grid',
  ecommerce:        'product_grid',
  'product grid':   'product_grid',
  'store products': 'product_grid',

  // ── Rich Text ──
  rich_text:      'rich_text',
  text:           'rich_text',
  content:        'rich_text',
  paragraph:      'rich_text',
  'rich text':    'rich_text',
  custom_content: 'rich_text',

  // ── Banner ──
  banner:               'banner',
  announcement:         'banner',
  announcement_banner:  'banner',
  promo_banner:         'banner',

  // ── CTA ──
  cta:               'cta',
  call_to_action:    'cta',
  'call to action':  'cta',
  calltoaction:      'cta',
  conversion:        'cta',

  // ── Gallery ──
  gallery:         'gallery',
  image_gallery:   'gallery',
  images:          'gallery',
  media:           'gallery',
  photo_gallery:   'gallery',

  // ── Product 360 ──
  product_360:          'product_360',
  product360:           'product_360',
  product_360_viewer:   'product_360',
  '360_product':        'product_360',
  '360_spin':           'product_360',
  'product 360 viewer': 'product_360',
  '360 spin':           'product_360',
  product_spin:         'product_360',
  interactive_product:  'product_360',

  // ── Premium 3D Scroll Hero ──
  premium_3d_scroll_hero: 'premium_3d_scroll_hero',
  premium_3d_hero:        'premium_3d_scroll_hero',
  scroll_hero:            'premium_3d_scroll_hero',
  scroll_story:           'premium_3d_scroll_hero',
  '3d_scroll_hero':       'premium_3d_scroll_hero',
  three_scroll_hero:      'premium_3d_scroll_hero',
  parallax_hero:          'premium_3d_scroll_hero',
  cinematic_hero:         'premium_3d_scroll_hero',

  // ── Custom / fallback ──
  custom: 'rich_text', // treat custom as rich_text so it renders
}

/**
 * Normalize a raw section_type string to a canonical CanonicalSectionType.
 * Trims, lowercases, collapses whitespace/dashes/underscores, and maps aliases.
 */
export function normalizeSectionType(input: unknown): CanonicalSectionType {
  if (!input || typeof input !== 'string') return 'unknown'

  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')      // spaces and dashes → underscores
    .replace(/_+/g, '_')           // collapse duplicate underscores
    .replace(/^_|_$/g, '')         // trim leading/trailing underscores

  return TYPE_ALIASES[slug] ?? TYPE_ALIASES[input.trim().toLowerCase()] ?? 'unknown'
}

// ── Safe helpers ──────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype ||
    (typeof value === 'object' && value !== null && !Array.isArray(value))
  )
}

function safeObject(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (isPlainObject(parsed)) return parsed
    } catch { /* ignore */ }
  }
  return {}
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function safeBoolean(value: unknown, fallback = true): boolean {
  if (value === false || value === 'false' || value === 0) return false
  if (value === true  || value === 'true'  || value === 1) return true
  return fallback
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Converts any raw Supabase section row into a safe NormalizedSection.
 * Never throws — malformed data produces a well-formed "unknown" section.
 */
export function normalizeSection(raw: unknown): NormalizedSection {
  const row = safeObject(raw)

  // --- id ---
  const id = safeString(row.id, `section-${Math.random().toString(36).slice(2)}`)

  // --- type ---
  const rawType = safeString(
    row.section_type ?? row.type ?? row.name ?? row.label ?? row.title,
    'unknown',
  )
  const type = normalizeSectionType(rawType)

  // --- pageId ---
  const pageId = safeString(row.page_id ?? row.pageId, '')

  // --- content: try multiple field names ---
  const content = safeObject(
    row.content ?? row.data ?? row.props ?? row.body ?? {},
  )

  // --- config ---
  const config = safeObject(
    row.config ?? row.settings ?? row.metadata ?? {},
  )

  // --- styles ---
  const styles = safeObject(
    row.styles ?? row.theme ?? {},
  )

  // --- sortOrder: try multiple field names ---
  const sortOrder = safeNumber(
    row.sort_order ?? row.position ?? row.display_order ?? row.order_index ?? 0,
    0,
  )

  // --- isVisible: default true unless explicitly false ---
  const isVisible = safeBoolean(
    row.is_visible ?? row.visible ?? row.enabled,
    true,
  )

  // --- status ---
  const status = safeString(row.status, 'published')

  return {
    id,
    type,
    rawType,
    pageId,
    content,
    config,
    styles,
    sortOrder,
    isVisible,
    status,
    raw: row,
  }
}

/**
 * Returns true if a section should be rendered publicly.
 * Sections without a status are considered published.
 */
export function isPublicVisible(section: NormalizedSection): boolean {
  if (!section.isVisible) return false
  const blocked = new Set(['draft', 'archived', 'deleted', 'disabled', 'hidden'])
  return !blocked.has(section.status.toLowerCase())
}

/**
 * Comparator for sorting sections by sortOrder ascending.
 */
export function bySortOrder(a: NormalizedSection, b: NormalizedSection): number {
  return a.sortOrder - b.sortOrder
}
