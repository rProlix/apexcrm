// lib/website-images/aspectRatio.ts
// Canonical aspect ratio helpers for the AI Website Image Builder.
// Re-exports from lib/website-ai/imagenAspectRatios.ts and adds
// type aliases matching the user-facing naming in this feature module.
//
// Safe to import from both server and client components.

export {
  type ImagenAspectRatio as WebsiteImageAspectRatio,
  SUPPORTED_IMAGEN_ASPECT_RATIOS as SUPPORTED_ASPECT_RATIOS,
  DEFAULT_IMAGEN_ASPECT_RATIO    as DEFAULT_ASPECT_RATIO,
  ASPECT_RATIO_LABELS,
  normalizeImagenAspectRatio     as normalizeAspectRatio,
  getDefaultAspectRatioForSection,
  isValidImagenAspectRatio       as isValidAspectRatio,
  getAspectRatioNormalizationNote,
} from '@/lib/website-ai/imagenAspectRatios'

// Re-export under the original name too for code that already uses it
export {
  normalizeImagenAspectRatio,
  type ImagenAspectRatio,
  SUPPORTED_IMAGEN_ASPECT_RATIOS,
  DEFAULT_IMAGEN_ASPECT_RATIO,
  isValidImagenAspectRatio,
} from '@/lib/website-ai/imagenAspectRatios'
