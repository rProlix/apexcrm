// lib/website-builder/imagePlacement.ts
// Maps AI image plans to the correct field in a site_sections content JSON.
// SERVER-ONLY — do not import in client components.
//
// KEY RULE: field names written here must exactly match what each section
// renderer reads from content. Using camelCase to match the TypeScript types
// defined in lib/website/types.ts and used by the site renderer components.

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
 * Field names match what the site renderer components actually read:
 * - HeroSection reads: backgroundImage
 * - AboutSection reads: image
 * - FeatureGridSection reads: bannerImage (new field) or items[].image
 * - TestimonialsSection reads: backgroundImage (new field)
 * - ImageGallerySection reads: images[]
 * - CtaSection reads: backgroundImage (new field)
 * - BannerSection / ContactSection / ProductGridSection: bannerImage (new field)
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
    _ai_model:       'imagen-4.0-ultra-generate-001',
    alt:             altText,
  }

  switch (sectionType) {
    // ── Hero ────────────────────────────────────────────────────────────────
    // HeroSection.tsx reads: content.backgroundImage
    case 'hero':
      return {
        contentPatch: { backgroundImage: imageUrl, backgroundImageMeta: meta },
        placementDescription: imageRole === 'hero_background'
          ? 'Hero background image'
          : 'Hero image',
      }

    // ── About ───────────────────────────────────────────────────────────────
    // AboutSection.tsx reads: content.image
    case 'about':
      return {
        contentPatch: { image: imageUrl, imageMeta: meta },
        placementDescription: 'About section feature image',
      }

    // ── Feature Grid / Services ─────────────────────────────────────────────
    // FeatureGridSection.tsx reads: content.bannerImage (added by this fix)
    // and items[].image for per-item images
    case 'feature_grid':
    case 'services':
      return {
        contentPatch: { bannerImage: imageUrl, bannerImageMeta: meta },
        placementDescription: 'Services section banner image',
      }

    // ── Testimonials / Reviews ──────────────────────────────────────────────
    // TestimonialsSection.tsx reads: content.backgroundImage (added by this fix)
    case 'testimonials':
    case 'reviews':
      return {
        contentPatch: { backgroundImage: imageUrl, backgroundImageMeta: meta },
        placementDescription: 'Testimonials background image',
      }

    // ── Image Gallery ───────────────────────────────────────────────────────
    // ImageGallerySection reads: content.images[]
    // Prepend a new image to the gallery array rather than overwriting.
    case 'image_gallery':
    case 'gallery':
      return {
        contentPatch: {
          _ai_gallery_image: { url: imageUrl, alt: altText, caption: '', _ai_meta: meta },
        },
        placementDescription: 'Gallery image',
      }

    // ── Product Grid ────────────────────────────────────────────────────────
    case 'product_grid':
      return {
        contentPatch: { bannerImage: imageUrl, bannerImageMeta: meta },
        placementDescription: 'Product section banner image',
      }

    // ── CTA ─────────────────────────────────────────────────────────────────
    // CtaSection.tsx reads: content.backgroundImage (added by this fix)
    case 'cta':
      return {
        contentPatch: { backgroundImage: imageUrl, backgroundImageMeta: meta },
        placementDescription: 'CTA background image',
      }

    // ── Banner (announcement) ───────────────────────────────────────────────
    // BannerSection is a text-only announcement strip — no image placement.
    // Fall through to default which sets bannerImage as a generic field.
    case 'banner':
      return {
        contentPatch: { bannerImage: imageUrl, bannerImageMeta: meta },
        placementDescription: 'Banner image',
      }

    // ── Contact ─────────────────────────────────────────────────────────────
    case 'contact':
      return {
        contentPatch: { bannerImage: imageUrl, bannerImageMeta: meta },
        placementDescription: 'Contact section banner image',
      }

    // ── Rich Text / FAQ ─────────────────────────────────────────────────────
    case 'rich_text':
    case 'faq':
      return {
        contentPatch: { featureImage: imageUrl, featureImageMeta: meta },
        placementDescription: 'Section feature image',
      }

    // ── Default fallback ────────────────────────────────────────────────────
    default:
      return {
        contentPatch: {
          backgroundImage: imageUrl,
          backgroundImageMeta: meta,
          // Legacy snake_case copy for backward compatibility with any custom
          // section renderers that may read these field names.
          background_image: imageUrl,
          image_url: imageUrl,
        },
        placementDescription: `Image for ${sectionType} section`,
      }
  }
}

/**
 * Merges an image content patch into existing section content.
 * Existing fields are preserved; only image fields are overwritten.
 *
 * Special handling for gallery sections:
 * If the patch contains `_ai_gallery_image`, it is prepended to the
 * existing `images` array rather than overwriting the whole array.
 */
export function mergeImageIntoContent(
  existing: Record<string, unknown>,
  patch:    Record<string, unknown>,
): Record<string, unknown> {
  const aiGalleryImage = patch._ai_gallery_image as Record<string, unknown> | undefined

  if (aiGalleryImage) {
    const { _ai_gallery_image: _, ...restPatch } = patch
    const existingImages = Array.isArray(existing.images) ? existing.images : []
    return {
      ...existing,
      ...restPatch,
      images: [aiGalleryImage, ...existingImages],
    }
  }

  return { ...existing, ...patch }
}
