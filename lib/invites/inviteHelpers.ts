// lib/invites/inviteHelpers.ts
// Shared helpers for invite token generation, hashing, and URL building.
// Server-only — never import in client components.

import { randomBytes, createHash } from 'crypto'

/**
 * Generates a cryptographically secure random token and its SHA-256 hash.
 * Only the hash is stored in the database; the raw token is sent in the invite URL.
 */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token     = randomBytes(32).toString('hex') // 64-char hex string
  const tokenHash = hashToken(token)
  return { token, tokenHash }
}

/**
 * SHA-256 hash of the raw token — stored in the database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Builds the full invite URL for a given tenant.
 * Prefers the tenant's custom domain → subdomain → app base URL fallback.
 */
export function buildInviteUrl(opts: {
  token:       string
  subdomain?:  string | null
  customDomain?: string | null
}): string {
  const { token, subdomain, customDomain } = opts
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

  let base: string
  if (customDomain) {
    base = `https://${customDomain}`
  } else if (subdomain) {
    base = `https://${subdomain}.${rootDomain}`
  } else {
    base = appUrl
  }

  return `${base}/invite/customer?token=${encodeURIComponent(token)}`
}

/** Returns an expiry date N days from now. */
export function expiresInDays(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}
