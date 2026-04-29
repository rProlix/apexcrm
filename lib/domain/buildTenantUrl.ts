// lib/domain/buildTenantUrl.ts
// Builds the preferred public URL for a tenant based on its domain config.

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL     ?? 'http://localhost:3000'

export type UrlTarget = 'site' | 'dashboard' | 'portal' | 'preview'

interface TenantUrlOptions {
  slug:          string
  customDomain?: string | null
  isVerified?:   boolean
  target?:       UrlTarget
  preview?:      boolean
}

/**
 * Returns the preferred public URL for a tenant.
 *
 * Priority:
 *  1. Custom domain (if verified)
 *  2. Platform subdomain ({slug}.yourcrm.com)
 *  3. Preview param fallback (?tenant=slug on APP_URL)
 */
export function buildTenantUrl({
  slug,
  customDomain,
  isVerified = false,
  target     = 'site',
  preview    = false,
}: TenantUrlOptions): string {
  const isLocal = APP_URL.includes('localhost')

  let baseUrl: string

  if (customDomain && isVerified && !preview) {
    baseUrl = `https://${customDomain}`
  } else if (isLocal) {
    baseUrl = `http://${slug}.localhost:3000`
  } else {
    baseUrl = `https://${slug}.${ROOT_DOMAIN}`
  }

  const pathMap: Record<UrlTarget, string> = {
    site:      '/',
    dashboard: '/dashboard',
    portal:    '/portal',
    preview:   '/preview',
  }

  return `${baseUrl}${pathMap[target]}`
}

/**
 * Returns the subdomain URL regardless of custom domain state.
 */
export function buildSubdomainUrl(slug: string): string {
  const isLocal = process.env.NODE_ENV === 'development'
  return isLocal
    ? `http://${slug}.localhost:3000`
    : `https://${slug}.${ROOT_DOMAIN}`
}

/**
 * Returns the preview URL for a tenant (always uses subdomain/preview path).
 */
export function buildPreviewUrl(slug: string): string {
  return `${buildSubdomainUrl(slug)}/preview`
}
