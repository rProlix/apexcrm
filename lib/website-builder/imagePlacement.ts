// lib/website-builder/imagePlacement.ts
// Maps AI image plans to the correct field in a site_sections content JSON.
// SERVER-ONLY — do not import in client components.

export interface PlacementResult {
  /** Patch to merge into the existing section content */
  contentPatch: Record<string, unknown>
  /** Human-readable description of where the image was placed */
  placementDescription: string
}

/**
 * Given a section_type and an image role, returns the content patch that
 * should be merged into site_sections.content to place the image.
 *
 * Falls back to a generic `image_url` field if no specific mapping exists.
 */
export function buildImageContentPatch(
  sectionType:   string,
  imageRole:     string,
  imageUrl:      string,
  altText:       string,
  planId:        string,
): PlacementResult {
  const meta = {
    _ai_generated:   true,
    _ai_plan_id:     planId,
    _ai_image_role:  imageRole,
    alt:             altText,
  }

  switch (sectionType) {
    case 'hero': {
      if (imageRole === 'hero_background') {
        return {
          contentPatch: { background_image: imageUrl, background_image_meta: meta },
          placementDescription: 'Hero background image',
        }
      }
      return {
        contentPatch: { image_url: imageUrl, image_meta: meta },
        placementDescription: 'Hero main image',
      }
    }

    case 'about':
      return {
        contentPatch: { image_url: imageUrl, image_meta: meta },
        placementDescription: 'About section feature image',
      }

    case 'feature_grid':
    case 'services':
      return {
        contentPatch: { banner_image: imageUrl, banner_image_meta: meta },
        placementDescription: 'Services section banner',
      }

    case 'testimonials':
    case 'reviews':
      return {
        contentPatch: { background_image: imageUrl, background_image_meta: meta },
        placementDescription: 'Testimonials background image',
      }

    case 'gallery':
      return {
        contentPatch: { cover_image: imageUrl, cover_image_meta: meta },
        placementDescription: 'Gallery cover image',
      }

    case 'product_grid':
      return {
        contentPatch: { banner_image: imageUrl, banner_image_meta: meta },
        placementDescription: 'Product grid banner',
      }

    case 'cta':
    case 'banner':
      return {
        contentPatch: { image_url: imageUrl, image_meta: meta },
        placementDescription: 'CTA/Banner image',
      }

    case 'contact':
      return {
        contentPatch: { banner_image: imageUrl, banner_image_meta: meta },
        placementDescription: 'Contact section banner',
      }

    case 'rich_text':
    case 'faq':
      return {
        contentPatch: { image_url: imageUrl, image_meta: meta },
        placementDescription: 'Section feature image',
      }

    default:
      return {
        contentPatch: { image_url: imageUrl, image_meta: meta },
        placementDescription: `Image for ${sectionType} section`,
      }
  }
}

/**
 * Merges an image content patch into existing section content.
 * Existing fields are preserved; only image fields are overwritten.
 */
export function mergeImageIntoContent(
  existing:     Record<string, unknown>,
  patch:        Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...patch }
}
