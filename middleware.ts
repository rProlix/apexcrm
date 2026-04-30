// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
const VERCEL_URL  = process.env.VERCEL_URL ?? ''

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host     = req.headers.get('host') ?? ''
  const hostname = host.split(':')[0]

  // Debug — visible in Vercel Function logs (remove after confirming routing)
  console.log('[middleware] HOST:', hostname, '| PATH:', pathname)

  // ── Static assets — skip all middleware logic ─────────────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // ── Supabase session refresh (MUST run on every request) ──────────────────
  //
  // Supabase access tokens expire every hour and are backed by one-time-use
  // refresh tokens. Only the middleware can write Set-Cookie headers that
  // persist refreshed tokens back to the browser. Without this call, tokens
  // expire silently and the user is forced to re-login in a loop.
  const sessionResponse = NextResponse.next({ request: req })
  const supabase = createMiddlewareSupabaseClient(req, sessionResponse)
  if (supabase) {
    try {
      await supabase.auth.getUser()
    } catch {
      // Non-fatal: if Supabase is unreachable we still route the request
    }
  }

  // ── Vercel preview / deployment URLs — pass through ───────────────────────
  if (hostname.endsWith('.vercel.app')) {
    return sessionResponse
  }

  // ── Root domain — serve the app directly ─────────────────────────────────
  if (
    hostname === ROOT_DOMAIN        ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname === `app.${ROOT_DOMAIN}` ||
    hostname === 'localhost'        ||
    (VERCEL_URL && hostname === VERCEL_URL.split(':')[0])
  ) {
    return sessionResponse
  }

  // ── Extract subdomain ────────────────────────────────────────────────────
  //
  // Handles:
  //   acme.nexoranow.com → parts = ['acme', 'nexoranow', 'com'] → subdomain = 'acme'
  //   acme.localhost      → parts = ['acme', 'localhost']       → subdomain = 'acme'
  const parts     = hostname.split('.')
  const subdomain = parts.length > 2 ? parts[0]
    : (parts.length === 2 && hostname.endsWith('.localhost') ? parts[0] : null)

  console.log('[middleware] SUBDOMAIN:', subdomain)

  // ── Tenant subdomain rewrite ─────────────────────────────────────────────
  if (subdomain) {
    const rewriteUrl    = req.nextUrl.clone()
    rewriteUrl.pathname = `/sites/${subdomain}${pathname === '/' ? '' : pathname}`

    console.log('[middleware] REWRITE →', rewriteUrl.pathname)

    const rewriteResponse = NextResponse.rewrite(rewriteUrl, { request: req })

    // Expose routing context to server components via request headers
    rewriteResponse.headers.set('x-tenant-slug',  subdomain)
    rewriteResponse.headers.set('x-is-platform',  'false')

    // Forward refreshed session cookies to the rewrite response
    sessionResponse.cookies.getAll().forEach(({ name, value, ...opts }) => {
      rewriteResponse.cookies.set({ name, value, ...opts })
    })

    return rewriteResponse
  }

  // ── Custom / unknown domain — pass through; page resolves via DB ──────────
  return sessionResponse
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)', '/'],
}
