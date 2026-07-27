'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/types'
import { getSupabaseEnv } from '@/lib/env'
import { getCookieDomain } from '@/lib/auth/cookieDomain'

/**
 * Returns '.nexoranow.com' when the current page is on the production root
 * domain or any subdomain of it. This makes auth cookies visible to ALL
 * subdomains so a session set on nexoranow.com is readable on
 * tenant.nexoranow.com and vice versa.
 *
 * Returns undefined on localhost and Vercel preview URLs so we never set a
 * cross-origin domain attribute that the browser would silently reject.
 */
function getBrowserCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return getCookieDomain(window.location.hostname)
}

/**
 * Cookie-backed browser Supabase client.
 * Reads env vars and the current hostname at call time so the cookie domain
 * is always correct for the current page (production vs preview vs localhost).
 * Sessions are stored in cookies so middleware and server components can
 * read them server-side via @supabase/ssr.
 */
export function getSupabaseBrowserClient() {
  const { url, key: anon } = getSupabaseEnv()
  const cookieDomain       = getBrowserCookieDomain()

  return createBrowserClient<Database>(url, anon, {
    ...(cookieDomain ? {
      cookieOptions: {
        domain:   cookieDomain,
        path:     '/',
        sameSite: 'lax' as const,
        secure:   true,
      },
    } : {}),
  })
}
