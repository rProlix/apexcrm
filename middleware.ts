// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL     ?? 'http://localhost:3000'

// Paths that always bypass all middleware logic
const ALWAYS_PUBLIC = ['/_next', '/favicon.ico', '/api/health']

// Auth pages — redirect authenticated users away
const AUTH_PATHS = ['/login', '/signup']

// Dashboard/admin paths that require a session
const PROTECTED_PREFIXES = [
  '/dashboard', '/modules', '/settings', '/tenants',
  '/admin', '/portal', '/website', '/store', '/customers',
]

// Paths on a tenant host that stay in the dashboard app (NOT rewritten to public site)
const DASHBOARD_PREFIXES = [
  '/dashboard', '/modules', '/settings', '/tenants',
  '/admin', '/portal', '/website', '/store', '/customers',
  '/login', '/signup', '/logout', '/api',
]

// ── Module route enforcement ───────────────────────────────────────────────────
const MODULE_ROUTE_MAP: Record<string, string> = {
  '/payments':     'payments',
  '/rewards':      'rewards',
  '/appointments': 'appointments',
  '/store':        'store',
  '/website':      'website',
  '/vehicles':     'vehicles',
  '/leads':        'leads',
  '/messages':     'messages',
  '/contacts':     'contacts',
  '/damage_ai':    'damage_ai',
  '/customers':    'customers',
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

  if (ALWAYS_PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── Host normalisation ─────────────────────────────────────────────────────
  const hostname   = host.split(':')[0].toLowerCase()
  const isPlatform = isPlatformRootHost(hostname)
  const domainType = resolveDomainType(hostname)   // 'platform' | 'subdomain' | 'custom'
  const tenantKey  = resolveTenantKey(hostname)     // slug, full hostname, or null

  // ── Module access enforcement ──────────────────────────────────────────────
  if (user) {
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

  // ── Platform root domain ───────────────────────────────────────────────────
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

  // ── Tenant host (subdomain or verified custom domain) ──────────────────────
  // For custom domains: verify the domain is in our DB before serving.
  // Unverified / unknown custom domains get a not-found response.
  if (domainType === 'custom') {
    const isVerified = await isVerifiedCustomDomain(supabase, hostname)
    if (!isVerified) {
      return NextResponse.rewrite(new URL('/not-found', request.url))
    }
  }

  const resolvedSlug = domainType === 'subdomain' ? tenantKey! : null

  response.headers.set('x-tenant-slug',  tenantKey ?? '')
  response.headers.set('x-hostname',     hostname)
  response.headers.set('x-is-platform',  'false')
  response.headers.set('x-domain-type',  domainType)
  if (resolvedSlug) response.headers.set('x-tenant-resolved-slug', resolvedSlug)
  if (user)         response.headers.set('x-auth-uid', user.id)

  // Dashboard paths on tenant host — serve normally with tenant context
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

  // Preview mode — skip public rewrite
  if (pathname.startsWith('/preview')) {
    return response
  }

  // ── Public site rewrite ───────────────────────────────────────────────────
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

  response.cookies.getAll().forEach(({ name, value }) => {
    rewritten.cookies.set(name, value)
  })

  return rewritten
}

// ── Module enforcement helper ─────────────────────────────────────────────────

type SupabaseEdgeClient = ReturnType<typeof createServerClient>

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

// ── Custom domain verification check ─────────────────────────────────────────

async function isVerifiedCustomDomain(
  supabase: SupabaseEdgeClient,
  hostname: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('tenant_domains')
      .select('id, is_verified')
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

function isPlatformRootHost(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname === ROOT_DOMAIN) return true
  if (hostname === `app.${ROOT_DOMAIN}`) return true
  const appHostname = safeHostname(APP_URL)
  if (hostname === appHostname) return true
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
 * Returns a tenant key for the hostname:
 *  - "rentalco"         for rentalco.yourcrm.com
 *  - "rentalco"         for rentalco.localhost
 *  - "www.rentalco.com" for a custom domain
 *  - null               for the platform root
 */
function resolveTenantKey(hostname: string): string | null {
  if (hostname === 'localhost') return null

  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace(/\.localhost$/, '')
    return sub || null
  }

  const suffix = `.${ROOT_DOMAIN}`
  if (hostname.endsWith(suffix)) {
    const sub = hostname.slice(0, hostname.length - suffix.length)
    return sub || null
  }

  const appHostname = safeHostname(APP_URL)
  if (hostname === ROOT_DOMAIN || hostname === appHostname) return null

  return hostname
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname } catch { return 'localhost' }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
