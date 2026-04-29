// lib/tenant-resolver.ts
//
// Unified tenant resolver used by middleware, page components, and server actions.
//
// Resolution priority:
//  1. Subdomain   — tenant.nexoranow.com       → resolves by slug
//  2. Custom domain — mybusiness.com           → resolves by hostname lookup in DB
//  3. Fallback route — /sites/[tenant]         → resolves by slug (tenantParam has no dot)
//
// The middleware always rewrites inbound requests to /sites/[tenantParam]/…
// where tenantParam is either:
//   • the slug   (from a known subdomain)
//   • the full hostname (from a custom domain or unknown host)

import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import type { SiteByHostResult } from '@/lib/website/types'

export interface TenantResolution {
  /** Internal UUID of the tenant */
  tenantId:       string
  /** URL slug (e.g. "rentalco") */
  slug:           string
  /** Canonical public domain (custom if connected, otherwise subdomain) */
  domain:         string
  /** True when the request came in on a verified custom domain */
  isCustomDomain: boolean
  /** Raw site data from the DB */
  siteData:       SiteByHostResult
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

/**
 * Resolves the tenant from the `[tenant]` route parameter injected by middleware.
 *
 * @param tenantParam  The raw [tenant] path segment — either a slug or a full hostname.
 * @returns Resolved tenant info, or null if no tenant can be found.
 */
export async function resolveTenant(
  tenantParam: string,
): Promise<TenantResolution | null> {
  const key           = decodeURIComponent(tenantParam)
  const isHostParam   = key.includes('.')          // custom domain passed through middleware

  const siteData = isHostParam
    ? await getSiteByHost(key)
    : await getSiteBySlug(key)

  if (!siteData) return null

  const { tenant } = siteData

  const isCustomDomain =
    isHostParam &&
    !!tenant.custom_domain &&
    key !== `${tenant.slug}.${ROOT_DOMAIN}`

  const domain =
    (isCustomDomain && tenant.custom_domain)
      ? tenant.custom_domain
      : `${tenant.slug}.${ROOT_DOMAIN}`

  return {
    tenantId:       tenant.id,
    slug:           tenant.slug,
    domain,
    isCustomDomain,
    siteData,
  }
}

/**
 * Builds the correct base path for internal links within a tenant site.
 *
 * When the request is served from the platform root (x-is-platform header),
 * links must be prefixed with /sites/[tenantParam] so they resolve correctly.
 * On subdomain or custom domain requests the prefix is empty (links are root-relative).
 *
 * @param isPlatform  Value of the x-is-platform request header (string or null).
 * @param tenantParam The raw [tenant] route segment.
 */
export function buildTenantBasePath(
  isPlatform: string | null,
  tenantParam: string,
): string {
  return isPlatform === 'true' ? `/sites/${tenantParam}` : ''
}
