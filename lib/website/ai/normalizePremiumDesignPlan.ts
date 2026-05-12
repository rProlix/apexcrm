// lib/website/ai/normalizePremiumDesignPlan.ts
// Normalizes a raw AI-generated premium design plan before Zod validation.
//
// CRITICAL RULE: Gemini often returns section labels ("hero", "features", etc.)
// as sectionId values. This function maps those labels to real DB UUIDs,
// or converts them to null if no match exists. This must run BEFORE Zod validation
// so that the UUID check never sees invalid strings.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AvailableWebsiteSection {
  id:     string
  type?:  string | null
  title?: string | null
  name?:  string | null
  order?: number | null
  pageId?: string | null
}

export interface NormalizeOptions {
  selectedSectionId?: string | null
  scope?: 'global' | 'page' | 'section'
}

// ── UUID guard ────────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

// ── Animation targetType normalization ───────────────────────────────────────
// Maps any Gemini targetType value → the three valid DB values:
//   "page" | "section" | "component"

type ValidTargetType = 'page' | 'section' | 'component'

// exported so safeStripAnimationTargetTypes can reference it
export const TARGET_TYPE_MAP: Record<string, ValidTargetType> = {
  // → page
  page:      'page', website: 'page', site: 'page', global: 'page',
  fullpage:  'page', full_page: 'page', layout: 'page', background: 'page',
  whole:     'page', all: 'page',

  // → section
  section:        'section',
  hero:           'section', hero_banner: 'section', banner: 'section',
  feature_grid:   'section', features: 'section', about: 'section',
  about_us:       'section', testimonials: 'section', reviews: 'section',
  faq:            'section', contact: 'section', contact_us: 'section',
  pricing:        'section', gallery: 'section', products: 'section',
  shop:           'section', services: 'section', footer: 'section',
  header:         'section', navigation: 'section', modal: 'section',
  popup:          'section', overlay: 'section', sidebar: 'section',

  // → component (everything sub-section: elements, widgets, UI pieces)
  component:          'component',
  text:               'component', heading: 'component', headline: 'component',
  subheading:         'component', paragraph: 'component', copy: 'component',
  label:              'component', caption: 'component',
  card:               'component', feature_card: 'component', testimonial_card: 'component',
  product_card:       'component', review_card: 'component', pricing_card: 'component',
  stat_card:          'component', info_card: 'component',
  button:             'component', cta: 'component', cta_button: 'component',
  link:               'component',
  image:              'component', photo: 'component', avatar: 'component',
  logo:               'component', icon:  'component', svg: 'component',
  badge:              'component', tag: 'component', chip: 'component',
  form:               'component', input: 'component', field: 'component',
  nav:                'component', menu: 'component', navbar: 'component',
  carousel:           'component', slider: 'component',
  grid:               'component', list: 'component', table: 'component',
  stat:               'component', counter: 'component', number: 'component',
  video:              'component', iframe: 'component',
  product_viewer:     'component', product_360: 'component', spin_360: 'component',
  map:                'component', embed: 'component',
  divider:            'component', spacer: 'component', separator: 'component',
  quote:              'component', blockquote: 'component',
  social:             'component', social_links: 'component',
  rating:             'component', stars: 'component',
}

/**
 * Maps any Gemini-returned targetType to 'page' | 'section' | 'component'.
 * Unknown values default to 'component' (safest assumption).
 */
export function normalizeTargetType(raw: unknown): ValidTargetType {
  if (typeof raw !== 'string' || raw.trim() === '') return 'section'
  const key = raw.trim().toLowerCase().replace(/[-\s]/g, '_')
  return TARGET_TYPE_MAP[key] ?? 'component'
}

// ── Section type aliases ──────────────────────────────────────────────────────
// Maps common Gemini labels → DB section_type values

const TYPE_ALIASES: Record<string, string[]> = {
  hero:         ['hero', 'hero_banner', 'banner', 'landing', 'header', 'hero_section'],
  features:     ['features', 'feature_grid', 'featuregrid', 'services', 'modules', 'benefits', 'why_us'],
  about:        ['about', 'about_us', 'about_section', 'story', 'team', 'mission'],
  testimonials: ['testimonials', 'reviews', 'testimonial', 'review', 'social_proof'],
  faq:          ['faq', 'faqs', 'questions', 'q_and_a', 'help', 'accordion'],
  contact:      ['contact', 'contact_us', 'contact_section', 'get_in_touch', 'reach_us'],
  pricing:      ['pricing', 'plans', 'packages', 'tiers'],
  gallery:      ['gallery', 'images', 'portfolio', 'photos', 'media', 'image_gallery'],
  products:     ['products', 'product_grid', 'shop', 'store', 'catalog', 'menu'],
  services:     ['services', 'service_grid', 'service_list', 'what_we_do'],
  cta:          ['cta', 'call_to_action', 'conversion', 'signup', 'book', 'get_started'],
  footer:       ['footer', 'bottom', 'foot'],
}

// Invert aliases: 'hero_banner' → 'hero', 'featuregrid' → 'features', etc.
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [canonical, aliases] of Object.entries(TYPE_ALIASES)) {
    for (const alias of aliases) {
      map.set(alias.toLowerCase(), canonical)
    }
  }
  return map
}

const ALIAS_MAP = buildAliasMap()

function normalizeLabel(label: string): string {
  const lower = label.toLowerCase().replace(/[^a-z0-9]/g, '_')
  return ALIAS_MAP.get(lower) ?? ALIAS_MAP.get(lower.replace(/_/g, '')) ?? lower
}

// ── Section lookup builder ────────────────────────────────────────────────────

interface SectionLookup {
  byId:    Map<string, AvailableWebsiteSection>
  byType:  Map<string, AvailableWebsiteSection>
  byTitle: Map<string, AvailableWebsiteSection>
  byName:  Map<string, AvailableWebsiteSection>
  all:     AvailableWebsiteSection[]
}

function buildLookup(sections: AvailableWebsiteSection[]): SectionLookup {
  const byId    = new Map<string, AvailableWebsiteSection>()
  const byType  = new Map<string, AvailableWebsiteSection>()
  const byTitle = new Map<string, AvailableWebsiteSection>()
  const byName  = new Map<string, AvailableWebsiteSection>()

  for (const s of sections) {
    byId.set(s.id, s)

    if (s.type) {
      const typeKey = s.type.toLowerCase()
      byType.set(typeKey, s)
      // Also register each alias that maps to this type
      for (const [alias, canonical] of ALIAS_MAP.entries()) {
        if (canonical === typeKey || canonical === normalizeLabel(typeKey)) {
          byType.set(alias, s)
        }
      }
    }

    if (s.title) byTitle.set(s.title.toLowerCase(), s)
    if (s.name)  byName.set(s.name.toLowerCase(), s)
  }

  return { byId, byType, byTitle, byName, all: sections }
}

// ── Resolve a single sectionId candidate to a known UUID ─────────────────────

function resolveToSectionId(
  candidates: string[],
  lookup:     SectionLookup,
): string | null {
  for (const candidate of candidates) {
    if (!candidate || candidate.trim() === '') continue
    const trimmed = candidate.trim()

    // Already a valid UUID — check if it's in our section list
    if (UUID_REGEX.test(trimmed)) {
      return lookup.byId.has(trimmed) ? trimmed : null
    }

    // Label — try type lookup (direct + normalized)
    const typeKey    = trimmed.toLowerCase()
    const normalized = normalizeLabel(trimmed)

    const match =
      lookup.byType.get(typeKey) ??
      lookup.byType.get(normalized) ??
      lookup.byTitle.get(typeKey) ??
      lookup.byName.get(typeKey)

    if (match) return match.id
  }
  return null
}

// ── Main normalization function ───────────────────────────────────────────────

export function normalizePremiumDesignPlan(
  rawPlan:           unknown,
  availableSections: AvailableWebsiteSection[],
  options?:          NormalizeOptions,
): Record<string, unknown> {
  // Safely convert to object
  const plan: Record<string, unknown> =
    rawPlan !== null && typeof rawPlan === 'object' && !Array.isArray(rawPlan)
      ? { ...(rawPlan as Record<string, unknown>) }
      : {}

  const lookup = buildLookup(availableSections)
  const availableIds = new Set(availableSections.map(s => s.id))

  // ── Normalize sectionUpgrades ───────────────────────────────────────────────
  const rawUpgrades = Array.isArray(plan.sectionUpgrades) ? plan.sectionUpgrades : []
  const unmatchedRefs: string[] = []
  const normalizedIds: (string | null)[] = []

  const normalizedUpgrades = rawUpgrades.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item

    const u = item as Record<string, unknown>

    // Collect all possible identifiers Gemini might have used
    const rawCandidates: unknown[] = [
      u.sectionId, u.section_id, u.id, u.sectionKey, u.section_key,
      u.sectionType, u.section_type, u.type, u.title, u.sectionTitle, u.name,
    ]
    const candidates: string[] = rawCandidates
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

    let resolvedId = resolveToSectionId(candidates, lookup)

    // If scope === 'section' and we have a forced selectedSectionId, apply it
    // only when the upgrade hasn't already resolved to a different valid section
    if (
      options?.scope === 'section' &&
      options.selectedSectionId &&
      isUuid(options.selectedSectionId) &&
      availableIds.has(options.selectedSectionId) &&
      (resolvedId === null || resolvedId === options.selectedSectionId)
    ) {
      resolvedId = options.selectedSectionId
    }

    // Track debug info
    if (resolvedId === null && candidates.length > 0) {
      unmatchedRefs.push(candidates[0])
    }
    normalizedIds.push(resolvedId)

    // Preserve sectionType from original even if sectionId became null
    const sectionType =
      typeof u.sectionType === 'string' ? u.sectionType :
      typeof u.section_type === 'string' ? u.section_type :
      typeof u.type === 'string' ? u.type :
      ''

    return {
      ...u,
      sectionId:   resolvedId,      // normalized UUID or null
      sectionType: sectionType,
    }
  })

  plan.sectionUpgrades = normalizedUpgrades

  // ── Normalize animations.targetType ────────────────────────────────────────
  // "text", "card", "button", etc. → "component"
  // "hero", "features", etc. → "section"
  // "website", "global", etc. → "page"
  const rawAnimations = Array.isArray(plan.animations) ? plan.animations : []
  const targetTypeMappings: Array<{ original: unknown; normalized: string }> = []
  const unmatchedTargets: unknown[] = []

  const normalizedAnimations = rawAnimations.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item
    const a = item as Record<string, unknown>

    const rawTargetType = a.targetType
    const normalizedType = normalizeTargetType(rawTargetType)

    if (rawTargetType !== normalizedType) {
      targetTypeMappings.push({ original: rawTargetType, normalized: normalizedType })
    }

    // When the raw targetType was a component-level term, preserve it as componentType
    // (unless componentType already exists)
    const isComponentTerm =
      typeof rawTargetType === 'string' &&
      TARGET_TYPE_MAP[rawTargetType.trim().toLowerCase().replace(/[-\s]/g, '_')] === 'component' &&
      !['component'].includes(rawTargetType.trim().toLowerCase())

    const componentType =
      a.componentType ??
      (isComponentTerm ? rawTargetType : undefined)

    // Normalize sectionId on animations when targetType is 'section'
    let sectionId = a.sectionId ?? null
    if (normalizedType === 'section' && sectionId !== null) {
      // Try to resolve label → UUID
      const rawCandidates: unknown[] = [sectionId, a.targetId, a.targetKey, a.sectionType, a.section_type]
      const candidates: string[] = rawCandidates.filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      )
      const resolved = resolveToSectionId(candidates, lookup)
      sectionId = resolved
      if (resolved === null && candidates.length > 0) unmatchedTargets.push(candidates[0])
    }

    // Force selectedSectionId for section-scope plans
    if (
      normalizedType === 'section' &&
      options?.scope === 'section' &&
      options.selectedSectionId &&
      isUuid(options.selectedSectionId) &&
      availableIds.has(options.selectedSectionId) &&
      !sectionId
    ) {
      sectionId = options.selectedSectionId
    }

    return {
      ...a,
      targetType:         normalizedType,
      originalTargetType: rawTargetType,
      ...(componentType !== undefined ? { componentType } : {}),
      ...(normalizedType === 'section' ? { sectionId } : {}),
    }
  })

  plan.animations = normalizedAnimations

  if (process.env.NODE_ENV !== 'production') {
    console.info('[AI Premium] normalized targetTypes:', targetTypeMappings)
  }

  // ── Dev-only debug info ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    plan._debug = {
      availableSectionCount:    availableSections.length,
      normalizedSectionIds:     normalizedIds,
      unmatchedSectionRefs:     unmatchedRefs,
      targetTypeMappings,
      unmatchedTargets,
      availableSections:        availableSections.map(s => ({ id: s.id, type: s.type, title: s.title })),
    }
  }

  return plan
}

// ── Final safety strip for targetType — run immediately before Zod ───────────
// Converts any remaining invalid targetType to 'page'|'section'|'component'.

export function safeStripAnimationTargetTypes(
  plan: Record<string, unknown>,
): Record<string, unknown> {
  const anims = Array.isArray(plan.animations) ? plan.animations : []
  plan.animations = anims.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item
    const a = { ...(item as Record<string, unknown>) }
    const valid = new Set(['page', 'section', 'component'])
    if (!valid.has(a.targetType as string)) {
      a.targetType = normalizeTargetType(a.targetType)
    }
    return a
  })
  return plan
}

// ── Final safety strip — run immediately before Zod validation ───────────────
// Strips any remaining non-UUID sectionId values that normalization may have missed.

export function safeStripSectionIds(
  plan:             Record<string, unknown>,
  availableSectionIds: Set<string>,
): Record<string, unknown> {
  const upgrades = Array.isArray(plan.sectionUpgrades) ? plan.sectionUpgrades : []

  plan.sectionUpgrades = upgrades.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item
    const u = { ...(item as Record<string, unknown>) }
    const sid = u.sectionId

    if (sid === null || sid === undefined || sid === '') {
      u.sectionId = null
      return u
    }
    if (typeof sid !== 'string' || !UUID_REGEX.test(sid)) {
      u.sectionId = null
      return u
    }
    if (!availableSectionIds.has(sid)) {
      // UUID format is valid but doesn't belong to these sections
      u.sectionId = null
    }
    return u
  })

  return plan
}
