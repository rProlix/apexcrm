// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

// ── Environment ───────────────────────────────────────────────────────────────
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL     ?? 'http://localhost:3000'
// Vercel injects VERCEL_URL automatically — format: "project-name-abc123.vercel.app"
const VERCEL_URL  = process.env.VERCEL_URL ?? ''

// ── Route groups ──────────────────────────────────────────────────────────────

// Paths that require a session on the platform domain
const PROTECTED_PREFIXES = [
  '/dashboard', '/modules', '/settings', '/tenants',
  '/admin', '/portal', '/website', '/store', '/customers',
  '/appointments', '/payments', '/rewards', '/staff',
]

// Auth pages — redirect already-authenticated users away
const AUTH_PATHS = ['/login', '/signup']

// Dashboard/app paths served on a tenant host without public-site rewrite
const DASHBOARD_PREFIXES = [
  '/dashboard', '/modules', '/settings', '/tenants',
  '/admin', '/portal', '/website', '/store', '/customers',
  '/api', '/appointments', '/payments', '/rewards', '/staff',
  '/preview',
]

// ── Main middleware ───────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') ?? ''

  // Pass through static assets immediately — no auth overhead
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Build a mutable response so Supabase can write refreshed session cookies
  const response = NextResponse.next({ request })

  // Refresh Supabase session — never crash if env vars are missing
  const supabase = createMiddlewareSupabaseClient(request, response)
  let user: { id: string } | null = null
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user ?? null
    } catch (err) {
      console.error('[middleware] supabase.auth.getUser failed:', err)
    }
  }

  const hostname  = host.split(':')[0].toLowerCase()
  const isPlatform = isPlatformHost(hostname)

  // ── Platform domain ────────────────────────────────────────────────────────
  if (isPlatform) {
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
    const isAuthPage  = AUTH_PATHS.some((p) => pathname.startsWith(p))

    // Unauthenticated user hitting a protected route → /login
    if (isProtected && !user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Authenticated user hitting an auth page → /dashboard
    if (isAuthPage && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (user) response.headers.set('x-auth-uid', user.id)
    response.headers.set('x-is-platform', 'true')
    response.headers.set('x-domain-type', 'platform')
    return response
  }

  // ── Tenant host (subdomain or verified custom domain) ─────────────────────
  const tenantKey = extractTenantKey(hostname)

  // Unknown / unresolvable host — pass through to Next.js (will 404 naturally)
  if (!tenantKey) {
    return NextResponse.next()
  }

  response.headers.set('x-tenant-slug', tenantKey)
  response.headers.set('x-hostname',    hostname)
  response.headers.set('x-is-platform', 'false')

  // Dashboard/app paths on a tenant host → serve without public-site rewrite
  const isDashboard = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p))
  if (isDashboard) {
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
    if (isProtected && !user) {
      // Staff must authenticate via the platform domain
      const platformLogin = new URL('/login', APP_URL)
      platformLogin.searchParams.set('next', pathname)
      return NextResponse.redirect(platformLogin)
    }
    return response
  }

  // ── Public-site rewrite ───────────────────────────────────────────────────
  // Rewrite: tenant.nexoranow.com/foo → /sites/[tenant]/foo
  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = `/sites/${encodeURIComponent(tenantKey)}${
    pathname === '/' ? '' : pathname
  }`

  const rewritten = NextResponse.rewrite(rewriteUrl, { request })
  rewritten.headers.set('x-tenant-slug', tenantKey)
  rewritten.headers.set('x-hostname',    hostname)
  rewritten.headers.set('x-is-platform', 'false')
  if (user) rewritten.headers.set('x-auth-uid', user.id)

  // Forward any session cookies refreshed during this request
  response.cookies.getAll().forEach(({ name, value }) => {
    rewritten.cookies.set(name, value)
  })

  return rewritten
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true for the platform's own hostnames.
 * Recognised hosts:
 *   - localhost              local dev
 *   - ROOT_DOMAIN            production root (e.g. nexoranow.com)
 *   - www.ROOT_DOMAIN        www alias
 *   - app.ROOT_DOMAIN        alternate platform entry-point
 *   - NEXT_PUBLIC_APP_URL    explicitly configured app URL
 *   - VERCEL_URL             auto-injected deployment URL
 *   - *.vercel.app           all Vercel preview/production deployments
 */
function isPlatformHost(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname === ROOT_DOMAIN) return true
  if (hostname === `www.${ROOT_DOMAIN}`) return true
  if (hostname === `app.${ROOT_DOMAIN}`) return true

  if (VERCEL_URL) {
    const vercelHost = VERCEL_URL.split(':')[0]
    if (hostname === vercelHost) return true
  }

  if (hostname.endsWith('.vercel.app')) return true

  try {
    const appHost = new URL(APP_URL).hostname
    if (appHost && appHost !== 'localhost' && hostname === appHost) return true
  } catch { /* ignore invalid APP_URL */ }

  return false
}

/**
 * Extracts the tenant key from a hostname.
 *
 * Returns:
 *   - slug string  → for *.ROOT_DOMAIN subdomains and *.localhost
 *   - full hostname → for custom domains (page-level DB lookup handles verification)
 *   - null          → for the platform root (should be caught by isPlatformHost first)
 */
function extractTenantKey(hostname: string): string | null {
  // {slug}.localhost  (local multi-tenant dev)
  if (hostname.endsWith('.localhost')) {
    return hostname.replace(/\.localhost$/, '') || null
  }

  // {slug}.ROOT_DOMAIN  (e.g. acme.nexoranow.com)
  const suffix = `.${ROOT_DOMAIN}`
  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, hostname.length - suffix.length) || null
  }

  // Custom domain — return full hostname; page will verify via DB
  // Only reached when isPlatformHost() returned false, so ROOT_DOMAIN itself
  // is never passed here.
  return hostname || null
}

export const config = {
  // Run on all paths except Next.js internals and favicon.
  // API routes are intentionally included so headers are forwarded.
  matcher: ['/((?!_next|favicon.ico).*)'],
}
