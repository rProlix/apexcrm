// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

// ── Environment ───────────────────────────────────────────────────────────────
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL     ?? 'http://localhost:3000'

// Vercel injects VERCEL_URL automatically (no NEXT_PUBLIC_ prefix needed in middleware).
// Format: "project-name-abc123.vercel.app" — used to detect all Vercel deployments.
const VERCEL_URL = process.env.VERCEL_URL ?? ''

// ── Static path lists ─────────────────────────────────────────────────────────

// Paths that bypass all middleware logic entirely
const ALWAYS_PUBLIC = ['/_next', '/favicon.ico', '/api/health']

// Auth pages — redirect authenticated users away
const AUTH_PATHS = ['/login', '/signup']

// Dashboard/admin paths that require a session
const PROTECTED_PREFIXES = [
  '/dashboard', '/modules', '/settings', '/tenants',
  '/admin', '/portal', '/website', '/store', '/customers',
]

// Paths on a tenant host that stay in the dashboard app (NOT rewritten to tenant public site)
const DASHBOARD_PREFIXES = [
  '/dashboard', '/modules', '/settings', '/tenants',
  '/admin', '/portal', '/website', '/store', '/customers',
  '/login', '/signup', '/logout', '/api', '/appointments', '/payments', '/rewards',
]

// ── Module route enforcement ───────────────────────────────────────────────────
const MODULE_ROUTE_MAP: Record<string, string> = {
  '/payments':         'payments',
  '/rewards':          'rewards',
  '/appointments':     'appointments',
  '/store':            'store',
  '/website':          'website',
  '/vehicles':         'vehicles',
  '/leads':            'leads',
  '/messages':         'messages',
  '/contacts':         'contacts',
  '/damage_ai':        'damage_ai',
  '/customers':        'customers',
  '/api/payments':     'payments',
  '/api/rewards':      'rewards',
  '/api/appointments': 'appointments',
  '/api/store':        'store',
  '/api/website':      'website',
  '/api/customers':    'customers',
}

const MIDDLEWARE_DEFAULT_ENABLED: Record<string, boolean> = {
  payments:     true,
  appointments: true,
  contacts:     true,
  leads:        true,
  messages:     true,
  store:        true,
  website:      true,
  customers:    true,
  rewards:      false,
  vehicles:     false,
  damage_ai:    false,
}

function getModuleFromPath(pathname: string): string | null {
  for (const [prefix, key] of Object.entries(MODULE_ROUTE_MAP)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key
  }
  return null
}

// ── Main middleware ───────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get('host') ?? ''

  // Short-circuit for static assets and health checks
  if (ALWAYS_PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const response = NextResponse.next({ request })

  // Edge-safe Supabase client — returns null if env vars are absent.
  // Auth is skipped gracefully in that case (no crash, request passes through).
  const supabase = createMiddlewareSupabaseClient(request, response)

  // Catch Supabase auth errors gracefully — never crash a user request
  let user: { id: string } | null = null
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (err) {
      console.error('[middleware] supabase.auth.getUser failed:', err)
    }
  } else {
    console.warn('[middleware] Supabase env vars missing — skipping auth, allowing request')
  }

  // ── Host normalisation ─────────────────────────────────────────────────────
  const hostname   = host.split(':')[0].toLowerCase()
  const isPlatform = isPlatformRootHost(hostname)
  const domainType = resolveDomainType(hostname)
  const tenantKey  = resolveTenantKey(hostname)

  // ── Module access enforcement (authenticated users only) ──────────────────
  if (user && supabase) {
    const moduleKey = getModuleFromPath(pathname)
    if (moduleKey) {
      const blocked = await enforceModuleAccess({
        supabase,
        userId:     user.id,
        tenantKey,
        moduleKey,
        isApiRoute: pathname.startsWith('/api/'),
        request,
      })
      if (blocked) return blocked
    }
  }

  // ── Platform root domain (localhost / yourcrm.com / *.vercel.app) ─────────
  if (isPlatform) {
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
    const isAuthPage  = AUTH_PATHS.some((p) => pathname.startsWith(p))

    if (isProtected && !user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (isAuthPage && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (user) response.headers.set('x-auth-uid', user.id)
    response.headers.set('x-is-platform', 'true')
    response.headers.set('x-tenant-slug', '')
    response.headers.set('x-domain-type', 'platform')
    return response
  }

  // ── Tenant host (subdomain or verified custom domain) ────────────────────
  // For custom (non-subdomain) domains: verify before serving.
  if (domainType === 'custom') {
    // If Supabase is unavailable we can't verify the domain — return 404 to
    // prevent serving tenant content on an unverified host.
    const isVerified = supabase
      ? await isVerifiedCustomDomain(supabase, hostname)
      : false
    if (!isVerified) {
      return new NextResponse(null, { status: 404 })
    }
  }

  const resolvedSlug = domainType === 'subdomain' ? tenantKey! : null

  response.headers.set('x-tenant-slug',  tenantKey ?? '')
  response.headers.set('x-hostname',     hostname)
  response.headers.set('x-is-platform',  'false')
  response.headers.set('x-domain-type',  domainType)
  if (resolvedSlug) response.headers.set('x-tenant-resolved-slug', resolvedSlug)
  if (user)         response.headers.set('x-auth-uid', user.id)

  // Dashboard/app paths on a tenant host — serve the app without rewriting
  const isDashboardPath = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p))

  if (isDashboardPath) {
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
    const isAuthPage  = AUTH_PATHS.some((p) => pathname.startsWith(p))

    if (isProtected && !user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (isAuthPage && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return response
  }

  // Preview mode — skip public site rewrite
  if (pathname.startsWith('/preview')) {
    return response
  }

  // ── Public site rewrite ───────────────────────────────────────────────────
  // tenantKey is guaranteed non-null here (subdomain or verified custom domain)
  const sitePath   = pathname === '/' ? '' : pathname
  const rewriteUrl = new URL(
    `/sites/${encodeURIComponent(tenantKey!)}${sitePath}${search}`,
    request.url,
  )

  const rewritten = NextResponse.rewrite(rewriteUrl, { request })
  rewritten.headers.set('x-tenant-slug',  tenantKey ?? '')
  rewritten.headers.set('x-hostname',     hostname)
  rewritten.headers.set('x-is-platform',  'false')
  rewritten.headers.set('x-domain-type',  domainType)
  if (user) rewritten.headers.set('x-auth-uid', user.id)

  // Forward any auth cookies set during this request
  response.cookies.getAll().forEach(({ name, value }) => {
    rewritten.cookies.set(name, value)
  })

  return rewritten
}

// ── Module enforcement helper ─────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type SupabaseEdgeClient = SupabaseClient<Database>

interface EnforceModuleParams {
  supabase:   SupabaseEdgeClient
  userId:     string
  tenantKey:  string | null
  moduleKey:  string
  isApiRoute: boolean
  request:    NextRequest
}

async function enforceModuleAccess(params: EnforceModuleParams): Promise<NextResponse | null> {
  const { supabase, userId, tenantKey, moduleKey, isApiRoute, request } = params

  try {
    const { data: userRecord } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (!userRecord) return null
    if (userRecord.role === 'owner') return null

    let tenantId: string | null = null

    if (tenantKey) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .or(`slug.eq.${tenantKey},subdomain.eq.${tenantKey},custom_domain.eq.${tenantKey}`)
        .eq('status', 'active')
        .maybeSingle()
      tenantId = tenant?.id ?? null
    } else {
      tenantId = userRecord.tenant_id as string | null
    }

    if (!tenantId) return null

    const { data: moduleRecord } = await supabase
      .from('tenant_modules')
      .select('enabled')
      .eq('tenant_id', tenantId)
      .eq('module_key', moduleKey)
      .maybeSingle()

    const defaultEnabled = MIDDLEWARE_DEFAULT_ENABLED[moduleKey] ?? true
    const isEnabled = moduleRecord !== null
      ? (moduleRecord.enabled as boolean)
      : defaultEnabled

    if (isEnabled) return null

    if (isApiRoute) {
      return NextResponse.json(
        { error: `Module '${moduleKey}' is not enabled for this tenant` },
        { status: 403 },
      )
    }

    const redirectUrl = new URL('/dashboard', request.url)
    redirectUrl.searchParams.set('error', 'module_disabled')
    return NextResponse.redirect(redirectUrl)

  } catch (err) {
    console.error('[middleware] enforceModuleAccess error:', err)
    return null
  }
}

// ── Custom domain verification ────────────────────────────────────────────────

async function isVerifiedCustomDomain(
  supabase: SupabaseEdgeClient,
  hostname: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('tenant_domains')
      .select('id')
      .eq('hostname', hostname)
      .eq('domain_type', 'custom')
      .eq('is_verified', true)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true for the platform's own hostnames.
 * Any request reaching this middleware from these hosts is treated as a
 * platform-admin / SaaS-app request, NOT a tenant public site.
 *
 * Includes:
 *   - localhost               local dev
 *   - yourcrm.com             production root domain
 *   - app.yourcrm.com         alternate platform root
 *   - NEXT_PUBLIC_APP_URL     explicitly configured app URL
 *   - VERCEL_URL              auto-injected by Vercel (this deployment)
 *   - *.vercel.app            all Vercel preview/production deployments of this project
 */
function isPlatformRootHost(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname === ROOT_DOMAIN) return true
  if (hostname === `app.${ROOT_DOMAIN}`) return true

  // Explicit APP_URL env var (e.g. https://app.yourcrm.com or https://yourapp.vercel.app)
  const appHostname = safeHostname(APP_URL)
  if (appHostname && appHostname !== 'localhost' && hostname === appHostname) return true

  // Vercel auto-injects VERCEL_URL for the current deployment (no NEXT_PUBLIC_ prefix)
  // Format: "project-name-gitbranch-abc123.vercel.app"
  if (VERCEL_URL) {
    const vercelHostname = safeHostname(`https://${VERCEL_URL}`)
    if (hostname === vercelHostname) return true
  }

  // All *.vercel.app hostnames belong to this project's preview/production deployments.
  // Requests to other Vercel projects never reach this middleware instance.
  if (hostname.endsWith('.vercel.app')) return true

  return false
}

type DomainType = 'platform' | 'subdomain' | 'custom'

function resolveDomainType(hostname: string): DomainType {
  if (isPlatformRootHost(hostname)) return 'platform'
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) return 'subdomain'
  if (hostname.endsWith('.localhost'))       return 'subdomain'
  return 'custom'
}

/**
 * Returns the tenant key (slug or full hostname) for the given host.
 * Returns null for platform root hosts.
 */
function resolveTenantKey(hostname: string): string | null {
  if (isPlatformRootHost(hostname)) return null

  if (hostname.endsWith('.localhost')) {
    return hostname.replace(/\.localhost$/, '') || null
  }

  const suffix = `.${ROOT_DOMAIN}`
  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, hostname.length - suffix.length) || null
  }

  // Custom domain — use the full hostname as the tenant key
  return hostname
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}

export const config = {
  // Exclude all Next.js internals and favicon from middleware.
  // _next/* covers static assets, image responses, data fetches, chunks, and webpack files.
  // API routes are intentionally kept in scope for module-access enforcement.
  matcher: ['/((?!_next|favicon.ico).*)'],
}
