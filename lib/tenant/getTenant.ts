/**
 * Server-side tenant context reader for App Router server components,
 * layouts, and route handlers.
 *
 * The middleware stamps every request with `x-tenant-slug` (and related
 * headers) before it reaches a page. Reading here is zero-cost — it never
 * makes a Supabase call.
 *
 * For the full TenantRecord object (when you need name, branding, etc.)
 * use getTenantFromHost() or resolveTenantByHost() instead.
 */
import { headers } from 'next/headers'

export interface TenantContext {
  /** Tenant slug (e.g. "rentalco"), or "public" for the platform root. */
  slug: string
  /** Hostname from the original request (e.g. "rentalco.yourcrm.com"). */
  hostname: string
  /** Whether the request originated from the platform root domain. */
  isPlatform: boolean
  /** How the domain was resolved: 'platform' | 'subdomain' | 'custom' */
  domainType: 'platform' | 'subdomain' | 'custom'
  /** Authenticated user id set by middleware, or null if unauthenticated. */
  authUid: string | null
}

/**
 * Returns the tenant context stamped by middleware for this request.
 *
 * Falls back to safe defaults when headers are absent (e.g. during static
 * analysis or when called from a page that bypasses middleware).
 */
export async function getTenant(): Promise<TenantContext> {
  const h = await headers()

  const slug       = h.get('x-tenant-slug')     ?? 'public'
  const hostname   = h.get('x-hostname')         ?? 'localhost'
  const isPlatform = h.get('x-is-platform')      === 'true'
  const rawType    = h.get('x-domain-type')      ?? 'platform'
  const authUid    = h.get('x-auth-uid')         ?? null

  const domainType = (rawType === 'subdomain' || rawType === 'custom')
    ? rawType
    : 'platform'

  return { slug, hostname, isPlatform, domainType, authUid }
}

/**
 * Convenience: returns just the tenant slug.
 * Use when you only need the slug for a database filter.
 */
export async function getTenantSlug(): Promise<string> {
  const { slug } = await getTenant()
  return slug
}
