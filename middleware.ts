// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
const VERCEL_URL  = process.env.VERCEL_URL ?? ''

// Paths that require an authenticated session on the owner domain.
// All other paths (/, /login, /signup, /sites/*, /api/*) remain public.
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding', '/admin']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host     = req.headers.get('host') ?? ''
  const hostname = host.split(':')[0]

  // Debug — check Vercel Function logs to confirm routing behaviour
  console.log('[middleware] HOST:', hostname, '| PATH:', pathname)

  // ── Static assets — skip all middleware logic ─────────────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // ── Supabase session refresh (MUST run on every non-static request) ────────
  //
  // Supabase access tokens expire every hour. Only middleware can write
  // Set-Cookie headers that refresh the token before the server component
  // runs. Skipping this causes silent session loss → re-login loops.
  //
  // We also capture the user here for the auth guard below — no extra
  // network round-trip because getUser() is needed for the refresh anyway.
  const sessionResponse = NextResponse.next({ request: req })
  const supabase = createMiddlewareSupabaseClient(req, sessionResponse)

  let user: { id: string } | null = null
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch {
      // Non-fatal: unreachable Supabase → route the request without a session
    }
  }

  console.log('[middleware] USER:', user?.id ?? 'none')

  // ── Platform domain check ─────────────────────────────────────────────────
  const isOwnerDomain = (
    hostname === ROOT_DOMAIN          ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname === `app.${ROOT_DOMAIN}` ||
    hostname === 'localhost'          ||
    hostname.endsWith('.vercel.app')  ||
    (VERCEL_URL && hostname === VERCEL_URL.split(':')[0])
  )

  // ── Auth guard — protect owner-dashboard routes on the root domain ─────────
  //
  // Only fires for /dashboard, /onboarding, /admin when there is no session.
  // Public paths (/, /login, /signup, /sites/*) are intentionally excluded.
  //
  // We intentionally do NOT redirect authenticated users away from /login here.
  // That redirect is handled by app/page.tsx so there is only one authority —
  // two competing redirects (middleware + server component) is the most common
  // cause of the infinite login loop.
  if (isOwnerDomain && !user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    console.log('[middleware] Unauthenticated access to protected path — redirecting to /login')
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // ── Root domain / Vercel preview — serve the app directly ─────────────────
  if (isOwnerDomain) {
    return sessionResponse
  }

  // ── Extract tenant subdomain ──────────────────────────────────────────────
  //
  // Only match subdomains of ROOT_DOMAIN so we never accidentally treat an
  // unrelated hostname (e.g. a Vercel preview or custom domain) as a tenant.
  //
  //   erickvcontacf.nexoranow.com  →  subdomain = 'erickvcontacf'
  //   acme.localhost               →  subdomain = 'acme'
  //   unknown.com                  →  subdomain = null  (pass through)
  let subdomain: string | null = null
  if (hostname !== ROOT_DOMAIN && hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    subdomain = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1)
  } else if (hostname.endsWith('.localhost')) {
    subdomain = hostname.slice(0, hostname.length - '.localhost'.length)
  }
  if (subdomain === 'www') subdomain = null

  console.log('[middleware] SUBDOMAIN:', subdomain)

  // ── Tenant subdomain rewrite ──────────────────────────────────────────────
  //
  // /invite/* is served from the root app regardless of subdomain — the token
  // contains full tenant context, so no per-tenant route rewrite is needed.
  if (subdomain && pathname.startsWith('/invite/')) {
    // Pass through — serve the root app's /invite/customer page
    return sessionResponse
  }

  if (subdomain) {
    const rewriteUrl    = req.nextUrl.clone()
    rewriteUrl.pathname = `/sites/${subdomain}${pathname === '/' ? '' : pathname}`

    console.log('[middleware] REWRITE →', rewriteUrl.pathname)

    // CRITICAL: headers must be injected via `request.headers` in the rewrite
    // options, NOT via `rewriteResponse.headers.set()`.
    //
    // `response.headers.set()` sets HTTP *response* headers sent to the browser.
    // `request: { headers }` sets the *request* headers visible to server
    // components via `headers()` (next/headers). Using response headers here
    // is why x-original-host was silently dropped and the tenant layout always
    // fell back to getSiteBySlug() → "Site not found".
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-original-host', hostname)
    requestHeaders.set('x-tenant-slug',   subdomain)

    const rewriteResponse = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })

    // Forward refreshed session cookies to the rewrite response so tenant
    // server components can read the refreshed session.
    sessionResponse.cookies.getAll().forEach(({ name, value, ...opts }) => {
      rewriteResponse.cookies.set({ name, value, ...opts })
    })

    return rewriteResponse
  }

  // ── Custom / unknown domain — pass through; tenant page resolves via DB ───
  return sessionResponse
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)', '/'],
}
