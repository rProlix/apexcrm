// lib/ai/websiteImageConfig.ts
// Single source of truth for the Imagen model used by AI Website Image Builder.
// Server-side only — never import in client components.
// The existing text autofill model is in lib/ai/geminiConfig.ts and is untouched.

/** Storage bucket name for all AI-generated website images. */
export const WEBSITE_IMAGE_BUCKET = 'website-assets'

/** Imagen model used for website image generation. */
export const WEBSITE_IMAGE_MODEL = 'imagen-4.0-ultra-generate-001' as const

/** Returns the Imagen model. Respects an optional env override. */
export function getWebsiteImageModel(): string {
  return process.env.WEBSITE_IMAGE_MODEL?.trim() || WEBSITE_IMAGE_MODEL
}

/** Returns true if the image generation feature is enabled (default: true if API key present). */
export function getWebsiteImageGenerationEnabled(): boolean {
  const disabled = process.env.WEBSITE_AI_IMAGES_DISABLED?.trim()
  return disabled !== '1' && disabled !== 'true'
}

/** Builds the Supabase Storage path for a generated website image. */
export function buildImageStoragePath(
  tenantId:    string,
  planId:      string,
  filename:    string,
): string {
  return `tenants/${tenantId}/website/generated/${planId}/${filename}`
}
