// lib/auth/cookieDomain.ts
//
// Returns the Supabase auth cookie domain that makes sessions visible across
// all tenant subdomains on production.
//
// On nexoranow.com production:  returns ".nexoranow.com"
// On Vercel preview URLs:       returns undefined (no cross-origin attribute)
// On localhost:                 returns undefined

/**
 * Derives the correct cookie domain for Supabase auth tokens.
 *
 * Pass the current request's Host header value (server-side) or
 * window.location.hostname (browser-side).
 */
export function getCookieDomain(host?: string | null): string | undefined {
  if (!host) return undefined
  const cleanHost  = host.split(':')[0]
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (!rootDomain) return undefined
  if (cleanHost === rootDomain || cleanHost.endsWith(`.${rootDomain}`)) {
    return `.${rootDomain}`
  }
  return undefined
}
