// lib/utils/generateSlug.ts
// Slug generation utilities for tenant subdomains.
// Produces lowercase, URL-safe slugs from business names.

/**
 * Converts a business name to a URL-safe slug.
 * "Rental Co" → "rentalco"
 * "My Great Store!" → "mygreatstore"
 */
export function slugifyBusinessName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')                         // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')          // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')            // remove non-alphanumeric
    .replace(/\s+/g, '')                      // collapse spaces (no hyphens between words)
    .replace(/-+/g, '-')                      // collapse hyphens
    .replace(/^-|-$/g, '')                    // trim leading/trailing hyphens
    .slice(0, 48)                             // max length
    || 'tenant'                               // fallback
}

/**
 * Resolves a unique slug by appending a numeric suffix until unique.
 *
 * Usage (in server-only code):
 *   const slug = await resolveUniqueSlug(supabase, baseSlug)
 *
 * @param checkExists  async function returning true when the slug is taken
 * @param baseSlug     starting slug (already slugified)
 * @param maxAttempts  bail-out after this many retries
 */
export async function resolveUniqueSlug(
  checkExists:  (slug: string) => Promise<boolean>,
  baseSlug:     string,
  maxAttempts = 10,
): Promise<string> {
  let slug    = baseSlug
  let attempt = 0

  while (attempt < maxAttempts) {
    const taken = await checkExists(slug)
    if (!taken) return slug
    attempt++
    slug = `${baseSlug}${attempt}`
  }

  // Final fallback: append timestamp hash
  return `${baseSlug}-${Date.now().toString(36)}`
}

/**
 * Validates that a slug is URL-safe.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/.test(slug) || /^[a-z0-9]$/.test(slug)
}
