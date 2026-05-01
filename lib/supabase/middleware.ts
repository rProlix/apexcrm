/**
 * Edge-safe Supabase client factory for use in middleware.ts only.
 *
 * Rules:
 *  - Uses @supabase/ssr (NOT auth-helpers) — the modern replacement
 *  - Reads env vars inside the factory function (never at module scope)
 *  - No next/headers or next/cookies — incompatible with the Edge runtime
 *  - Passes NextRequest / NextResponse cookie adapters directly
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/types'
import { getSupabaseEnv } from '@/lib/env'

/**
 * Creates a Supabase client that is safe to use in Next.js middleware
 * (Edge runtime). Cookie reads come from the incoming NextRequest; writes
 * are forwarded to the outgoing NextResponse via Set-Cookie headers.
 *
 * When the request hostname is within the configured root domain (e.g.
 * nexoranow.com or tenant.nexoranow.com), refreshed session cookies are
 * written with domain=.nexoranow.com so they're shared across all
 * subdomains. On Vercel preview or localhost the domain is left unset.
 *
 * Returns null when env vars are absent so the middleware can degrade
 * gracefully instead of crashing during Vercel's build-time static analysis.
 */
export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  let url: string, anon: string
  try {
    const env = getSupabaseEnv()
    url  = env.url
    anon = env.key
  } catch {
    // Env vars absent (e.g. Vercel build-time static analysis).
    // Return null so middleware degrades gracefully instead of crashing.
    return null
  }

  const rootDomain   = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ''
  const hostname     = request.headers.get('host')?.split(':')[0] ?? ''
  const cookieDomain = rootDomain && (
    hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)
  ) ? `.${rootDomain}` : undefined

  return createServerClient<Database>(url, anon, {
    ...(cookieDomain ? {
      cookieOptions: {
        domain:   cookieDomain,
        path:     '/',
        sameSite: 'lax' as const,
        secure:   true,
      },
    } : {}),
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Write cookies onto both the outgoing response AND the cloned request
        // so the updated session is visible to downstream middleware/handlers.
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })
}

/**
 * Convenience wrapper that creates both the Supabase client and the
 * outgoing NextResponse in one call — matches the pattern used in the
 * official @supabase/ssr documentation.
 *
 * Usage in middleware.ts:
 *   const { supabase, response } = updateSession(req)
 *   const { data: { user } } = await supabase.auth.getUser()
 *   // ... routing logic ...
 *   return response
 *
 * The returned `response` already has any refreshed session cookies attached.
 * You MUST return it (or a redirect derived from it) — discarding it loses
 * the refreshed tokens and causes a re-login loop on the next request.
 */
export function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request })
  const supabase = createMiddlewareSupabaseClient(request, response)
  return { supabase, response }
}
