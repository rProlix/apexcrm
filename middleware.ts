// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
const VERCEL_URL  = process.env.VERCEL_URL ?? ''

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host     = req.headers.get('host') ?? ''
  const hostname = host.split(':')[0].toLowerCase()

  // ── Static assets — skip immediately ─────────────────────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // ── Step 1: Session refresh ───────────────────────────────────────────────
  // CRITICAL — this must run on every request regardless of routing outcome.
  //
  // @supabase/ssr stores sessions in short-lived access tokens (default 1 hr)
  // backed by a one-time-use refresh token. When the access token expires the
  // Supabase client silently exchanges the refresh token for a new pair.
  //
  // Server Components are read-only — they cannot write Set-Cookie headers.
  // If only the server component calls getUser(), the refreshed tokens are
  // never written back to the browser cookie store. On the next request the
  // old (already-consumed) refresh token is seen → exchange fails → user
  // appears unauthenticated → redirect to /login → infinite loop.
  //
  // The middleware CAN write cookies. By calling getUser() here we ensure
  // freshly-minted tokens are forwarded to the browser on every response,
  // breaking the loop permanently.
  const sessionResponse = NextResponse.next({ request: req })
  const supabase = createMiddlewareSupabaseClient(req, sessionResponse)
  if (supabase) {
    try {
      await supabase.auth.getUser()
    } catch {
      // Non-fatal: if Supabase is down we still route the request normally
    }
  }

  // ── Step 2: Routing ───────────────────────────────────────────────────────

  // Platform root domain(s) — serve the app directly.
  // Tag the request so pages under /sites/[tenant]/* know they are being
  // served via the platform URL (not via a tenant subdomain / custom domain).
  // This allows server components to build tenant-aware link prefixes.
  if (isPlatformHost(hostname)) {
    sessionResponse.headers.set('x-is-platform', 'true')
    return sessionResponse
  }

  // Tenant subdomain: acme.nexoranow.com or acme.localhost
  const tenantSlug = extractTenantSlug(hostname)

  if (!tenantSlug) {
    // Unknown host — fall through to Next.js (will 404 naturally)
    return sessionResponse
  }

  // Rewrite: acme.nexoranow.com/path → internal /sites/acme/path
  const rewriteUrl      = req.nextUrl.clone()
  rewriteUrl.pathname   = `/sites/${tenantSlug}${pathname === '/' ? '' : pathname}`
  const rewriteResponse = NextResponse.rewrite(rewriteUrl, { request: req })

  // Pass the original hostname so server components can resolve custom domains.
  rewriteResponse.headers.set('x-forwarded-host', hostname)
  rewriteResponse.headers.set('x-is-platform', 'false')

  // Copy the refreshed session cookies onto the rewrite response so the
  // browser receives the new tokens even on tenant-domain requests.
  sessionResponse.cookies.getAll().forEach(({ name, value, ...opts }) => {
    rewriteResponse.cookies.set({ name, value, ...opts })
  })

  return rewriteResponse
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPlatformHost(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname === ROOT_DOMAIN) return true
  if (hostname === `www.${ROOT_DOMAIN}`) return true
  if (hostname === `app.${ROOT_DOMAIN}`) return true
  if (VERCEL_URL && hostname === VERCEL_URL.split(':')[0]) return true
  if (hostname.endsWith('.vercel.app')) return true
  return false
}

function extractTenantSlug(hostname: string): string | null {
  if (hostname.endsWith('.localhost')) {
    return hostname.replace(/\.localhost$/, '') || null
  }
  const suffix = `.${ROOT_DOMAIN}`
  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, hostname.length - suffix.length) || null
  }
  // Custom domain — return full hostname; the page resolves via DB
  return hostname || null
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
