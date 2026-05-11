// lib/website-ai/imagenAspectRatios.ts
// Centralized Imagen aspect ratio normalizer.
//
// Imagen 4 supports ONLY these five values:
//   1:1 | 9:16 | 16:9 | 4:3 | 3:4
//
// Any other value sent to the API will cause:
//   { "error": { "code": 400, "message": "aspectRatio X:Y is not supported." } }
//
// This module is the single source of truth for aspect ratio handling.
// Import normalizeImagenAspectRatio everywhere a ratio is set in:
//   - DB inserts into website_image_plans.aspect_ratio
//   - Imagen API calls
//   - UI selectors

// ── Types ──────────────────────────────────────────────────────────────────────

export type ImagenAspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4'

export const SUPPORTED_IMAGEN_ASPECT_RATIOS: readonly ImagenAspectRatio[] = [
  '1:1',
  '9:16',
  '16:9',
  '4:3',
  '3:4',
] as const

export const DEFAULT_IMAGEN_ASPECT_RATIO: ImagenAspectRatio = '16:9'

// ── Mapping of unsupported → nearest supported ────────────────────────────────
// Keys are lowercase, stripped of whitespace.
// Gemini may return numeric ratios (3:2) OR text labels (landscape, hero, card).
// ALL of these must map to one of the five supported values.

const UNSUPPORTED_RATIO_MAP: Record<string, ImagenAspectRatio> = {
  // ── Numeric unsupported ratios ────────────────────────────────────────────
  '3:2':   '16:9',  // landscape photography → wide (user-requested mapping)
  '2:3':   '9:16',  // portrait photography  → vertical (user-requested)
  '4:5':   '3:4',   // tall portrait         → nearest portrait
  '5:4':   '4:3',   // wide square-ish       → nearest landscape
  '21:9':  '16:9',  // ultra-wide            → widescreen
  '16:10': '16:9',  // widescreen laptop     → widescreen
  '10:16': '9:16',  // tall phone            → vertical
  '2:1':   '16:9',  // ultra-landscape       → widescreen
  '1:2':   '9:16',  // ultra-portrait        → vertical
  '5:3':   '16:9',  // wide cinema-ish       → widescreen
  '3:5':   '3:4',   // tall narrow           → portrait
  '7:4':   '16:9',  // near-widescreen       → widescreen
  '4:7':   '3:4',   // near-portrait         → portrait
  '8:5':   '16:9',  // golden ratio wide-ish → widescreen
  '5:8':   '3:4',   // golden ratio portrait → portrait
  // ── Text labels that Gemini/AI planners may output ────────────────────────
  'landscape':      '16:9',
  'wide':           '16:9',
  'hero':           '16:9',
  'widescreen':     '16:9',
  'cinematic':      '16:9',
  'banner':         '16:9',
  'header':         '16:9',
  'cover':          '16:9',
  'portrait':       '9:16',
  'vertical':       '9:16',
  'mobile_story':   '9:16',
  'story':          '9:16',
  'tall':           '9:16',
  'square':         '1:1',
  '1x1':            '1:1',
  'square_photo':   '1:1',
  'instagram':      '1:1',
  'avatar':         '1:1',
  'icon':           '1:1',
  'card':           '4:3',
  'standard':       '4:3',
  'photo':          '4:3',
  'about':          '4:3',
  'section':        '4:3',
  'tall_portrait':  '3:4',
  'book':           '3:4',
  'pin':            '3:4',
  'pinterest':      '3:4',
}

// ── Section-type default ratios ───────────────────────────────────────────────
// If no explicit ratio is requested, pick the best one for the section type.

const SECTION_TYPE_DEFAULT_RATIO: Record<string, ImagenAspectRatio> = {
  // Hero variants → wide landscape
  hero:                '16:9',
  hero_banner:         '16:9',
  herobanner:          '16:9',
  homepage_hero:       '16:9',
  banner:              '16:9',
  header:              '16:9',

  // About/story → standard section
  about:               '4:3',
  about_section:       '4:3',
  aboutsection:        '4:3',

  // Feature grid cards → square icons
  feature_grid:        '1:1',
  featuregrid:         '1:1',
  feature:             '1:1',
  services:            '1:1',
  service_card:        '1:1',

  // Testimonials → wide background
  testimonials:        '16:9',
  reviews:             '16:9',

  // Contact / location
  contact:             '4:3',
  contact_section:     '4:3',
  contactsection:      '4:3',
  visit_showroom:      '4:3',
  showroom:            '4:3',

  // Gallery
  gallery:             '4:3',
  image_gallery:       '4:3',
  imagegallery:        '4:3',

  // Product / shop
  product_grid:        '1:1',
  productgrid:         '1:1',
  product:             '1:1',
  shop:                '1:1',
  ecommerce:           '1:1',

  // FAQ
  faq:                 '4:3',

  // CTA
  cta:                 '16:9',
  call_to_action:      '16:9',

  // Rich text / text blocks
  rich_text:           '16:9',
  text:                '16:9',

  // Mobile-specific
  mobile_story:        '9:16',
  vertical_banner:     '9:16',

  // Testimonials avatar / logo
  avatar:              '1:1',
  logo:                '1:1',
  icon:                '1:1',
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Returns a valid Imagen 4 aspect ratio.
 *
 * Priority:
 *   1. If `input` is already a supported ratio → return it unchanged.
 *   2. If `input` is an unsupported but known ratio/label → map it to the nearest.
 *   3. If `input` is null/undefined/empty or completely unknown → fall back to
 *      section-type default or 16:9.
 *
 * NEVER throws. Always returns one of: '1:1' | '9:16' | '16:9' | '4:3' | '3:4'.
 */
export function normalizeImagenAspectRatio(
  input?:       string | null,
  sectionType?: string | null,
): ImagenAspectRatio {
  const raw = (input ?? '').trim()

  if (raw) {
    const normalized = raw.toLowerCase().replace(/\s+/g, '_')

    // Already a supported ratio?
    if (SUPPORTED_IMAGEN_ASPECT_RATIOS.includes(normalized as ImagenAspectRatio)) {
      return normalized as ImagenAspectRatio
    }

    // Known unsupported value → mapped
    const mapped = UNSUPPORTED_RATIO_MAP[normalized]
    if (mapped) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[imagenAspectRatios] Unsupported ratio "${raw}" → normalized to "${mapped}". ` +
          `Imagen 4 only supports: ${SUPPORTED_IMAGEN_ASPECT_RATIOS.join(', ')}`
        )
      }
      return mapped
    }

    // Unknown value — fall through to section-type default
    console.warn(
      `[imagenAspectRatios] Unknown ratio "${raw}" — using section-type default for "${sectionType ?? 'unknown'}".`
    )
  }

  // No input or unknown — use section-type default
  if (sectionType) {
    const key = sectionType.toLowerCase().replace(/[-\s]/g, '_')
    const sectionDefault = SECTION_TYPE_DEFAULT_RATIO[key]
    if (sectionDefault) return sectionDefault
  }

  return DEFAULT_IMAGEN_ASPECT_RATIO
}

/**
 * Returns a valid Imagen 4 aspect ratio for a given section type.
 * Alias for normalizeImagenAspectRatio(null, sectionType).
 */
export function getDefaultAspectRatioForSection(sectionType: string): ImagenAspectRatio {
  return normalizeImagenAspectRatio(null, sectionType)
}

/**
 * Returns true when the provided ratio is valid for Imagen 4.
 */
export function isValidImagenAspectRatio(ratio: string): ratio is ImagenAspectRatio {
  return SUPPORTED_IMAGEN_ASPECT_RATIOS.includes((ratio ?? '').trim() as ImagenAspectRatio)
}

/**
 * Returns a human-readable explanation when a ratio was changed.
 * Returns null if no change was needed.
 */
export function getAspectRatioNormalizationNote(
  input: string | null | undefined,
  sectionType?: string | null,
): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()
  if (SUPPORTED_IMAGEN_ASPECT_RATIOS.includes(normalized as ImagenAspectRatio)) {
    return null  // No change needed
  }

  const result = normalizeImagenAspectRatio(input, sectionType)
  return (
    `Aspect ratio "${raw}" is not supported by Imagen 4. ` +
    `It was automatically converted to "${result}". ` +
    `Supported values: ${SUPPORTED_IMAGEN_ASPECT_RATIOS.join(', ')}.`
  )
}

/**
 * UI-friendly labels for the aspect ratio selector.
 * Only shows the 5 supported values.
 */
export const ASPECT_RATIO_LABELS: Record<ImagenAspectRatio, string> = {
  '16:9': '16:9 — Landscape / Hero',
  '4:3':  '4:3 — Standard section image',
  '1:1':  '1:1 — Square',
  '9:16': '9:16 — Vertical / Mobile story',
  '3:4':  '3:4 — Portrait',
}
