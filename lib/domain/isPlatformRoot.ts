// lib/domain/isPlatformRoot.ts
// Determines whether a hostname is the platform root (yourcrm.com / app.yourcrm.com).
// Used to distinguish marketing/admin traffic from tenant-scoped requests.

import { normalizeHost } from './normalizeHost'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL     ?? 'http://localhost:3000'

function getAppHostname(): string {
  try {
    return new URL(APP_URL).hostname
  } catch {
    return 'localhost'
  }
}

/**
 * Returns true when the host is the platform root domain or app hostname.
 *
 * Matches:
 *  - yourcrm.com
 *  - app.yourcrm.com
 *  - localhost (bare — no subdomain)
 *  - the app's configured APP_URL hostname
 */
export function isPlatformRoot(host: string): boolean {
  const h = normalizeHost(host)

  if (!h) return true
  if (h === 'localhost') return true
  if (h === ROOT_DOMAIN) return true
  if (h === `app.${ROOT_DOMAIN}`) return true
  if (h === getAppHostname()) return true

  return false
}
