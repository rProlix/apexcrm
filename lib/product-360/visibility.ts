// lib/product-360/visibility.ts
// Determines whether a package should be publicly visible.
// Used by both API routes and server components.

/**
 * Returns true if a package is publicly visible to storefront customers.
 * Rules:
 *   - status must be 'ready'
 *   - is_enabled must be true
 *   - if promo_starts_at is set, current time must be after it
 *   - if promo_ends_at is set, current time must be before it
 */
export function isPackagePubliclyVisible(pkg: {
  status:          string
  is_enabled:      boolean
  promo_starts_at: string | null | undefined
  promo_ends_at:   string | null | undefined
}): boolean {
  if (pkg.status !== 'ready') return false
  if (!pkg.is_enabled) return false

  const now = Date.now()
  if (pkg.promo_starts_at && new Date(pkg.promo_starts_at).getTime() > now) return false
  if (pkg.promo_ends_at   && new Date(pkg.promo_ends_at).getTime()   < now) return false

  return true
}

/**
 * SQL WHERE fragment for "publicly visible" – use in Supabase .filter() calls.
 * Returns an array of filter tuples: [column, operator, value]
 */
export function publicVisibilityFilters(now = new Date()): {
  status:     string
  is_enabled: boolean
} {
  return { status: 'ready', is_enabled: true }
}
