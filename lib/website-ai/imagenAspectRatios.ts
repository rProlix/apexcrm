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
// Import normalizeImagenAspectRatio everywhere an Imagen API call is made.

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

const UNSUPPORTED_RATIO_MAP: Record<string, ImagenAspectRatio> = {
  '3:2':   '4:3',   // landscape photography — nearest is 4:3
  '2:3':   '3:4',   // portrait photography  — nearest is 3:4
  '4:5':   '3:4',   // tall portrait          — nearest is 3:4
  '5:4':   '4:3',   // wide square-ish        — nearest is 4:3
  '21:9':  '16:9',  // ultra-wide             — nearest is 16:9
  '16:10': '16:9',  // widescreen laptop      — nearest is 16:9
  '10:16': '9:16',  // tall phone             — nearest is 9:16
  '2:1':   '16:9',  // ultra-landscape        — nearest is 16:9
  '1:2':   '9:16',  // ultra-portrait         — nearest is 9:16
  '5:3':   '16:9',  // wide cinema-ish        — nearest is 16:9
  '3:5':   '3:4',   // tall narrow            — nearest is 3:4
  '7:4':   '16:9',  // near-widescreen        — nearest is 16:9
  '4:7':   '3:4',   // near-portrait          — nearest is 3:4
  '8:5':   '16:9',  // golden ratio wide-ish  — nearest is 16:9
  '5:8':   '3:4',   // golden ratio portrait  — nearest is 3:4
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

  // About/story → slightly less wide
  about:               '4:3',
  about_section:       '4:3',
  aboutsection:        '4:3',

  // Feature grid cards → square
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
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Returns a valid Imagen 4 aspect ratio.
 *
 * Priority:
 *   1. If `input` is already a supported ratio → return it unchanged.
 *   2. If `input` is an unsupported but known ratio → map it to the nearest.
 *   3. If `input` is null/undefined/empty or completely unknown → fall back to
 *      section-type default or 16:9.
 *
 * NEVER throws. Always returns a supported value.
 */
export function normalizeImagenAspectRatio(
  input?:       string | null,
  sectionType?: string | null,
): ImagenAspectRatio {
  const raw = input?.trim() ?? ''

  if (raw) {
    const normalized = raw.toLowerCase()

    // Already supported
    if (SUPPORTED_IMAGEN_ASPECT_RATIOS.includes(normalized as ImagenAspectRatio)) {
      return normalized as ImagenAspectRatio
    }

    // Known unsupported → mapped
    const mapped = UNSUPPORTED_RATIO_MAP[normalized]
    if (mapped) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[imagenAspectRatios] Unsupported ratio "${raw}" → normalized to "${mapped}". ` +
          `Imagen 4 only supports: ${SUPPORTED_IMAGEN_ASPECT_RATIOS.join(', ')}`
        )
      }
      return mapped
    }

    // Unknown value — fall through to section-type default
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[imagenAspectRatios] Unknown ratio "${raw}" — using section-type default for "${sectionType ?? 'unknown'}".`
      )
    }
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
 * Returns true when the provided ratio is valid for Imagen 4.
 */
export function isValidImagenAspectRatio(ratio: string): ratio is ImagenAspectRatio {
  return SUPPORTED_IMAGEN_ASPECT_RATIOS.includes(ratio.trim() as ImagenAspectRatio)
}

/**
 * Returns a human-readable explanation when a ratio was changed.
 * Returns null if no change was needed.
 */
export function getAspectRatioNormalizationNote(
  input: string | null | undefined,
  sectionType?: string | null,
): string | null {
  const raw = input?.trim() ?? ''
  if (!raw) return null

  const normalized = raw.toLowerCase()
  if (SUPPORTED_IMAGEN_ASPECT_RATIOS.includes(normalized as ImagenAspectRatio)) {
    return null  // No change
  }

  const result = normalizeImagenAspectRatio(input, sectionType)
  return (
    `Aspect ratio "${raw}" is not supported by Imagen 4. ` +
    `It was automatically converted to "${result}". ` +
    `Supported values: ${SUPPORTED_IMAGEN_ASPECT_RATIOS.join(', ')}.`
  )
}
