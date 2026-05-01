/**
 * lib/tenant.ts
 *
 * Lightweight subdomain extractor for middleware and edge-compatible code.
 * This does pure string extraction — no database calls, no async operations.
 *
 * For full DB-backed tenant resolution (dashboard, admin contexts) use
 * lib/tenant/getTenantFromHost.ts which also queries tenant_domains and
 * resolves custom domains.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

/**
 * Returns the tenant slug embedded in the hostname, or null if the hostname
 * is the root platform domain, a Vercel preview URL, or localhost.
 *
 * Examples:
 *   erickvcontacf.nexoranow.com  →  'erickvcontacf'
 *   acme.localhost               →  'acme'
 *   nexoranow.com                →  null
 *   my-app.vercel.app            →  null
 */
export function getTenantFromHost(host: string): string | null {
  if (!host) return null
  const hostname = host.split(':')[0]

  if (
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname === 'localhost' ||
    hostname.endsWith('.vercel.app')
  ) {
    return null
  }

  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1) || null
  }

  if (hostname.endsWith('.localhost')) {
    return hostname.slice(0, hostname.length - '.localhost'.length) || null
  }

  return null
}
