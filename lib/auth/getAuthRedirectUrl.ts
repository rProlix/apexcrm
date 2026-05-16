/**
 * lib/auth/getAuthRedirectUrl.ts
 *
 * Centralised, safe helpers for building Supabase auth redirect URLs.
 *
 * Rules enforced here:
 *   - `next` must be a relative path starting with "/" (no open redirects).
 *   - Production always uses HTTPS; never sends localhost URLs to Supabase.
 *   - Customer storefront redirects derive the origin from the ACTUAL request
 *     host (business subdomain or custom domain), NOT from NEXT_PUBLIC_APP_URL.
 *   - CRM redirects always use NEXT_PUBLIC_APP_URL (nexoranow.com).
 *
 * How middleware sets the host for server actions:
 *   When a request arrives at  erickvcontacf.nexoranow.com/signup  the
 *   middleware rewrites it to /sites/erickvcontacf/signup and injects the
 *   header  x-original-host: erickvcontacf.nexoranow.com  into the request.
 *   Server actions see this header via `headers()` from next/headers.
 *   The `host` header alone is unreliable in some Vercel configurations, so
 *   x-original-host is the authoritative source for the storefront host.
 */

/** Minimal interface covering ReadonlyHeaders (next/headers) and Headers (fetch API). */
type HeaderLike = { get(name: string): string | null }

const APP_URL     = (process.env.NEXT_PUBLIC_APP_URL  ?? 'https://nexoranow.com').replace(/\/$/, '')
const ROOT_DOMAIN =  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
const IS_PROD     =  process.env.NODE_ENV === 'production'

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Allows only relative paths to prevent open redirect attacks.
 * "next" must start with exactly one "/" and not be a protocol-relative URL.
 */
function safeNextPath(next: string | undefined | null, fallback: string): string {
  if (!next || typeof next !== 'string') return fallback
  const decoded = decodeURIComponent(next)
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback
  return decoded
}

/**
 * Resolves the effective protocol for an origin.
 * - Production → always 'https' (never localhost in prod).
 * - Dev/test   → 'http' for localhost, 'https' for everything else.
 */
function resolveProtocol(cleanHost: string): string {
  if (IS_PROD) return 'https'
  if (cleanHost === 'localhost' || cleanHost.endsWith('.localhost')) return 'http'
  return 'https'
}

/**
 * Extracts the effective origin from request headers.
 *
 * Preference order (most → least reliable):
 *   1. x-original-host  — explicitly set by middleware for subdomain rewrites
 *   2. host             — raw HTTP Host header from the browser
 *   3. APP_URL          — last-resort fallback; logs a warning
 *
 * The `:port` portion is stripped for the host comparison but preserved when
 * building the origin string (so localhost:3000 → http://localhost:3000).
 */
export function resolveOriginFromHeaders(source: HeaderLike): string {
  const originalHost = source.get('x-original-host') ?? ''
  const rawHost      = source.get('host')             ?? ''
  const chosen       = (originalHost || rawHost).trim()

  if (!chosen) {
    console.warn(
      '[getAuthRedirectUrl] No host header found. Falling back to APP_URL. ' +
      'This usually means a server action was called outside of an HTTP request context.',
    )
    return APP_URL
  }

  const cleanHost = chosen.split(':')[0]

  // Guard: never send localhost URLs in production
  if (IS_PROD && (cleanHost === 'localhost' || cleanHost.endsWith('.localhost'))) {
    console.error(
      '[getAuthRedirectUrl] Localhost host detected in production environment. ' +
      'Falling back to APP_URL to prevent invalid Supabase redirect URLs.',
    )
    return APP_URL
  }

  const protocol = resolveProtocol(cleanHost)

  // Preserve port for local development (e.g. localhost:3000)
  const port = chosen.includes(':') ? `:${chosen.split(':')[1]}` : ''
  return `${protocol}://${cleanHost}${port}`
}

/**
 * Returns true if the given host belongs to the main CRM platform:
 *   nexoranow.com, www.nexoranow.com, app.nexoranow.com, localhost, *.vercel.app
 *
 * Returns false for tenant subdomains (erickvcontacf.nexoranow.com) and
 * custom domains (businesscustomdomain.com).
 *
 * Used by /auth/callback to pick the right post-auth destination.
 */
export function isMainCrmHost(host: string): boolean {
  const h = host.split(':')[0]
  return (
    h === ROOT_DOMAIN          ||
    h === `www.${ROOT_DOMAIN}` ||
    h === `app.${ROOT_DOMAIN}` ||
    h === 'localhost'          ||
    h.endsWith('.vercel.app')
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the `emailRedirectTo` URL for CRM owner / business staff signup.
 *
 * Always points to the main app domain (NEXT_PUBLIC_APP_URL / nexoranow.com)
 * regardless of where this function is called from.
 *
 * @param next  Relative path to redirect to after auth. Defaults to '/dashboard'.
 *
 * @example
 *   getCrmAuthRedirectUrl()              // https://nexoranow.com/auth/callback?next=%2Fdashboard
 *   getCrmAuthRedirectUrl('/onboarding') // https://nexoranow.com/auth/callback?next=%2Fonboarding
 */
export function getCrmAuthRedirectUrl(next: string = '/dashboard'): string {
  const nextPath = safeNextPath(next, '/dashboard')
  return `${APP_URL}/auth/callback?next=${encodeURIComponent(nextPath)}`
}

/**
 * Builds the `emailRedirectTo` URL for customer storefront signup.
 *
 * Derives the origin from the ACTUAL request host so the confirmation email
 * links back to the exact subdomain or custom domain the customer signed up on.
 *
 * @param source    Pass `await headers()` in a server action, or `request.headers`
 *                  in an API route handler.
 * @param next      Relative path to redirect to after auth. Defaults to '/account'.
 * @param tenantId  When provided, appended as `tenant_id` so /auth/callback can
 *                  activate the pending customer_accounts row.
 *
 * @example
 *   // Server action:
 *   const h = await headers()
 *   getStorefrontAuthRedirectUrl(h, '/account', tenantId)
 *   // → https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount&tenant_id=...
 *
 *   // API route:
 *   getStorefrontAuthRedirectUrl(request.headers, '/account', tenantId)
 */
export function getStorefrontAuthRedirectUrl(
  source:   HeaderLike,
  next:     string = '/account',
  tenantId?: string,
): string {
  const nextPath = safeNextPath(next, '/account')
  const origin   = resolveOriginFromHeaders(source)

  if (origin === APP_URL) {
    console.error(
      '[getStorefrontAuthRedirectUrl] Could not resolve storefront host — ' +
      'confirmation email will redirect to the main CRM domain instead of the ' +
      'business storefront. Check that middleware sets x-original-host correctly.',
    )
  }

  let url = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
  if (tenantId) url += `&tenant_id=${encodeURIComponent(tenantId)}`
  return url
}

/**
 * Builds the `redirectTo` URL for a storefront password reset email.
 *
 * Supabase sends the user to /auth/callback?type=recovery which then
 * redirects to /reset-password for the actual password update.
 *
 * @param source  Pass `await headers()` or `request.headers`.
 */
export function getStorefrontPasswordResetUrl(source: HeaderLike): string {
  const origin = resolveOriginFromHeaders(source)
  return `${origin}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
}

/**
 * Builds the `redirectTo` URL for a CRM password reset email.
 * Always points to the main app domain.
 */
export function getCrmPasswordResetUrl(): string {
  return `${APP_URL}/auth/callback?type=recovery&next=${encodeURIComponent('/reset-password')}`
}
