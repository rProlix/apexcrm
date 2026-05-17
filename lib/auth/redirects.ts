/**
 * lib/auth/redirects.ts
 *
 * Safe, testable helpers for building Supabase auth redirect URLs.
 *
 * Design rules:
 *   - `next` must be a same-origin relative path ("/…"). No open redirects.
 *   - HTTPS is always used in production. HTTP is allowed only for localhost in dev.
 *   - Storefront redirects derive the origin from the *actual HTTP request* object
 *     (via `getRequestOrigin`) so the origin is always the subdomain or custom
 *     domain the customer is visiting — never nexoranow.com.
 *   - CRM redirects always point to NEXT_PUBLIC_APP_URL (nexoranow.com).
 *
 * Usage:
 *   Server API route (preferred for storefront signup):
 *     const emailRedirectTo = getStorefrontEmailRedirectTo(request, '/account')
 *
 *   Server action (fallback — reads x-original-host set by middleware):
 *     const h = await headers()
 *     const emailRedirectTo = getStorefrontEmailRedirectToFromHeaders(h, '/account', tenantId)
 *
 *   CRM signup (browser or server):
 *     const emailRedirectTo = getCrmEmailRedirectTo('/dashboard')
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Minimal interface satisfied by Headers, ReadonlyHeaders (next/headers), and Request.headers */
type HeaderLike = { get(name: string): string | null }

// ─── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Sanitizes the `next` redirect path.
 * Only allows same-origin relative paths (must start with exactly one "/").
 * Rejects protocol-relative URLs ("//…"), absolute URLs, and empty strings.
 */
export function sanitizeNextPath(next?: string | null, fallback = '/account'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  return next
}

/**
 * Extracts the effective origin from a `Request` object.
 *
 * Preference order (most → least authoritative):
 *   1. x-forwarded-host header  — set by Vercel / reverse proxies
 *   2. host header              — raw HTTP Host from the browser
 *   3. url.host                 — derived from the request URL itself
 *
 * Always returns HTTPS in production. Returns HTTP only for localhost in dev.
 */
export function getRequestOrigin(req: Request): string {
  const url   = new URL(req.url)
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'https'

  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host')             ||
    url.host

  const cleanHost  = host.split(':')[0]
  const isLocalhost = cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost.endsWith('.localhost')
  const protocol   = isLocalhost ? 'http' : 'https'

  // Preserve port for local development (e.g. localhost:3000)
  const port = host.includes(':') ? `:${host.split(':')[1]}` : ''
  return `${protocol}://${cleanHost}${port}`

  void proto // proto from request is a secondary hint; protocol safety above takes precedence
}

// ─── Storefront helpers (use request.url — API routes) ─────────────────────────

/**
 * Builds the `emailRedirectTo` URL for a *customer storefront* signup.
 *
 * Use this in an API route handler where you have access to the `Request` object.
 * The origin is derived unambiguously from `request.url`, so it always reflects
 * the exact subdomain or custom domain the customer is signing up from.
 *
 * @example
 *   // app/api/storefront/auth/signup/route.ts
 *   const emailRedirectTo = getStorefrontEmailRedirectTo(request, '/account')
 *   // On erickvcontacf.nexoranow.com → https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount
 *   // On custombiz.com              → https://custombiz.com/auth/callback?next=%2Faccount
 */
export function getStorefrontEmailRedirectTo(req: Request, next = '/account'): string {
  const origin   = getRequestOrigin(req)
  const safeNext = sanitizeNextPath(next, '/account')
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
}

/**
 * Builds the `redirectTo` URL for a *storefront customer* password reset email.
 *
 * @example
 *   const redirectTo = getStorefrontPasswordResetRedirectTo(request)
 *   // → https://erickvcontacf.nexoranow.com/auth/callback?type=recovery&next=%2Freset-password
 */
export function getStorefrontPasswordResetRedirectTo(req: Request): string {
  const origin = getRequestOrigin(req)
  return `${origin}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
}

// ─── Storefront helpers (use x-original-host — server actions) ─────────────────

/**
 * Builds the `emailRedirectTo` URL for storefront signup *from a server action*,
 * where there is no `Request` object and headers must come from `next/headers`.
 *
 * Reads `x-original-host` (set by middleware for subdomain rewrites) first,
 * then falls back to the `host` header.
 *
 * Prefer `getStorefrontEmailRedirectTo(request, …)` in API routes — it is more
 * reliable. Use this only when the server action cannot be migrated to a route.
 *
 * @param source    Pass `await headers()` from next/headers.
 * @param next      Destination path after auth. Defaults to '/account'.
 * @param tenantId  When provided, appended as `tenant_id` query param.
 */
export function getStorefrontEmailRedirectToFromHeaders(
  source:   HeaderLike,
  next:     string = '/account',
  tenantId?: string,
): string {
  const safeNext = sanitizeNextPath(next, '/account')

  // x-original-host is set by middleware for every subdomain rewrite — it's the
  // authoritative header for the real public-facing host.
  const originalHost = source.get('x-original-host') ?? ''
  const rawHost      = source.get('host')             ?? ''
  const chosen       = (originalHost || rawHost).trim()

  if (!chosen) {
    console.error(
      '[redirects] getStorefrontEmailRedirectToFromHeaders: no host header found. ' +
      'Falling back to APP_URL — confirmation email will link to the main CRM domain.',
    )
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
    let url = `${appUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`
    if (tenantId) url += `&tenant_id=${encodeURIComponent(tenantId)}`
    return url
  }

  const cleanHost  = chosen.split(':')[0]
  const isLocalhost = cleanHost === 'localhost' || cleanHost.endsWith('.localhost')
  const isProd     = process.env.NODE_ENV === 'production'

  if (isProd && isLocalhost) {
    console.error('[redirects] Localhost host in production — falling back to APP_URL.')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
    let url = `${appUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`
    if (tenantId) url += `&tenant_id=${encodeURIComponent(tenantId)}`
    return url
  }

  const protocol = isLocalhost ? 'http' : 'https'
  const port     = chosen.includes(':') ? `:${chosen.split(':')[1]}` : ''
  const origin   = `${protocol}://${cleanHost}${port}`

  let url = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
  if (tenantId) url += `&tenant_id=${encodeURIComponent(tenantId)}`
  return url
}

/**
 * Builds the `redirectTo` URL for a *storefront customer* password reset email
 * from a server action (uses x-original-host like `getStorefrontEmailRedirectToFromHeaders`).
 */
export function getStorefrontPasswordResetRedirectToFromHeaders(source: HeaderLike): string {
  const originalHost = source.get('x-original-host') ?? ''
  const rawHost      = source.get('host')             ?? ''
  const chosen       = (originalHost || rawHost).trim()

  if (!chosen) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
    return `${appUrl}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
  }

  const cleanHost  = chosen.split(':')[0]
  const isLocalhost = cleanHost === 'localhost' || cleanHost.endsWith('.localhost')
  const isProd     = process.env.NODE_ENV === 'production'

  if (isProd && isLocalhost) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
    return `${appUrl}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
  }

  const protocol = isLocalhost ? 'http' : 'https'
  const port     = chosen.includes(':') ? `:${chosen.split(':')[1]}` : ''
  const origin   = `${protocol}://${cleanHost}${port}`
  return `${origin}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
}

// ─── CRM helpers ───────────────────────────────────────────────────────────────

/**
 * Builds the `emailRedirectTo` URL for CRM owner / business staff signup.
 *
 * Always points to NEXT_PUBLIC_APP_URL (nexoranow.com), regardless of
 * the current request origin.
 *
 * Safe to call on both server and client (uses `process.env.NEXT_PUBLIC_APP_URL`).
 *
 * @example
 *   getCrmEmailRedirectTo()              // https://nexoranow.com/auth/callback?next=%2Fdashboard
 *   getCrmEmailRedirectTo('/onboarding') // https://nexoranow.com/auth/callback?next=%2Fonboarding
 */
export function getCrmEmailRedirectTo(next = '/dashboard'): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL             ||
    'https://nexoranow.com'

  const cleanAppUrl = appUrl.replace(/\/$/, '')
  const safeNext    = sanitizeNextPath(next, '/dashboard')
  return `${cleanAppUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`
}

/**
 * Builds the `redirectTo` URL for CRM password reset email.
 * Always points to the main CRM domain.
 */
export function getCrmPasswordResetRedirectTo(): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL             ||
    'https://nexoranow.com'
  ).replace(/\/$/, '')
  return `${appUrl}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

/**
 * Returns true if the given hostname belongs to the main CRM platform
 * (nexoranow.com, localhost, *.vercel.app) rather than a business subdomain
 * or custom domain.
 *
 * Used in /auth/callback to choose the correct default post-auth destination.
 */
export function isMainCrmHost(host: string): boolean {
  const h = host.split(':')[0]
  return (
    h === ROOT_DOMAIN          ||
    h === `www.${ROOT_DOMAIN}` ||
    h === `app.${ROOT_DOMAIN}` ||
    h === 'localhost'          ||
    h === '127.0.0.1'         ||
    h.endsWith('.vercel.app')
  )
}
