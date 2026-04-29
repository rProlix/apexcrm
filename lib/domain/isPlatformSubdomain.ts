// lib/domain/isPlatformSubdomain.ts
// Checks whether a hostname is a platform-managed subdomain ({slug}.yourcrm.com).

import { normalizeHost } from './normalizeHost'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

/**
 * Returns true when the host is a platform subdomain.
 *
 * Matches:
 *  - rentalco.yourcrm.com   → true
 *  - salonx.yourcrm.com     → true
 *  - rentalco.localhost      → true (local dev)
 *  - yourcrm.com             → false (root)
 *  - www.rentalco.com        → false (custom domain)
 */
export function isPlatformSubdomain(host: string): boolean {
  const h = normalizeHost(host)
  if (!h) return false

  if (h.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = h.slice(0, h.length - ROOT_DOMAIN.length - 1)
    // Must be a single label (no dots) and non-empty; exclude "app" which is the root app host
    return sub.length > 0 && !sub.includes('.') && sub !== 'app'
  }

  // Local dev: slug.localhost
  if (h.endsWith('.localhost')) {
    const sub = h.replace(/\.localhost$/, '')
    return sub.length > 0 && !sub.includes('.')
  }

  return false
}

/**
 * Extracts the tenant slug from a platform subdomain hostname.
 * Returns null if the host is not a platform subdomain.
 *
 * "rentalco.yourcrm.com" → "rentalco"
 * "rentalco.localhost"   → "rentalco"
 */
export function extractSlugFromSubdomain(host: string): string | null {
  const h = normalizeHost(host)
  if (!h) return null

  if (h.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = h.slice(0, h.length - ROOT_DOMAIN.length - 1)
    if (sub && !sub.includes('.') && sub !== 'app') return sub
    return null
  }

  if (h.endsWith('.localhost')) {
    const sub = h.replace(/\.localhost$/, '')
    return sub && !sub.includes('.') ? sub : null
  }

  return null
}
