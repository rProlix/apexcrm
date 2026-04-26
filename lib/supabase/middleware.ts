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
import type { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase/types'

/**
 * Creates a Supabase client that is safe to use in Next.js middleware
 * (Edge runtime). Cookie reads come from the incoming NextRequest; writes
 * are forwarded to the outgoing NextResponse via Set-Cookie headers.
 *
 * Returns null when env vars are absent so the middleware can degrade
 * gracefully instead of crashing during Vercel's build-time static analysis.
 */
export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) return null

  return createServerClient<Database>(url, anon, {
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
