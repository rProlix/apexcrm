// app/auth/callback/route.ts
//
// Handles the Supabase Auth PKCE confirmation callback for:
//   - CRM business owner / staff email confirmation
//   - Customer storefront email confirmation (from any subdomain or custom domain)
//   - Password reset link (type=recovery)
//
// Supabase sends users here after they click a confirmation or reset email link:
//   https://your-domain.com/auth/callback?code=<pkce-code>&next=/destination
//
// Important routing notes:
//   - The middleware passes /auth/callback through unchanged for subdomain requests
//     so this route handler always processes it, regardless of the host.
//   - request.url reflects the original browser URL (subdomain / custom domain),
//     so origins derived from it are always correct.
//
// Post-auth destination logic:
//   - CRM domain (nexoranow.com, localhost, *.vercel.app) → defaults to /dashboard
//   - Storefront domain (tenant.nexoranow.com, custom domains) → defaults to /account
//
// Supabase Dashboard MUST include these Additional Redirect URLs:
//   https://nexoranow.com/auth/callback
//   https://*.nexoranow.com/auth/callback
//   https://nexoranow.com/reset-password
//   https://*.nexoranow.com/reset-password
//   (see docs/supabase-auth-redirect-urls.md for full list)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { isMainCrmHost } from '@/lib/auth/getAuthRedirectUrl'

// Only allow relative, same-origin redirect paths (no open redirects).
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  const decoded = decodeURIComponent(raw)
  // Must start with exactly one '/' and not be a protocol-relative URL
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback
  return decoded
}

// Build the final redirect URL using the request's own origin.
// This preserves the subdomain / custom domain / Vercel preview URL.
function buildRedirectUrl(request: NextRequest, path: string): URL {
  const url = new URL(request.url)
  return new URL(path, url.origin)
}

export async function GET(request: NextRequest) {
  const { searchParams, hostname } = new URL(request.url)

  const code     = searchParams.get('code')
  const tenantId = searchParams.get('tenant_id')
  const type     = searchParams.get('type')

  // Determine whether this callback is on the main CRM domain or a storefront.
  // This drives the default redirect destination when `next` is absent / invalid.
  const onMainDomain  = isMainCrmHost(hostname)
  const defaultNext   = onMainDomain ? '/dashboard' : '/account'
  const next          = safeNext(searchParams.get('next'), defaultNext)

  // ── Log callback context ────────────────────────────────────────────────────
  console.info('[auth/callback] request', {
    host:       hostname,
    type:       type ?? 'signup_confirmation',
    next,
    tenant_id:  tenantId ?? null,
    on_main:    onMainDomain,
  })

  // ── No code — broken or direct link ─────────────────────────────────────────
  if (!code) {
    // On storefront subdomains redirect to the storefront login.
    // On main domain redirect to the CRM login.
    const loginPath = onMainDomain ? '/login' : '/login'
    const loginUrl  = buildRedirectUrl(request, loginPath)
    loginUrl.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(loginUrl)
  }

  // ── Exchange PKCE code for session ───────────────────────────────────────────
  const supabase = await createSessionServerClient()
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session) {
    console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
    const loginUrl = buildRedirectUrl(request, '/login')
    loginUrl.searchParams.set('error', 'confirmation_failed')
    loginUrl.searchParams.set('message', error?.message ?? 'Link expired or already used.')
    return NextResponse.redirect(loginUrl)
  }

  // ── Activate pending customer account ────────────────────────────────────────
  //
  // When a customer signs up from a business storefront their customer_accounts
  // row is created with status='pending_confirmation'. The code exchange above
  // confirms their email — activate the row now.
  if (tenantId) {
    try {
      const admin = getSupabaseServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).rpc('activate_pending_customer_account', {
        p_auth_user_id: session.user.id,
        p_tenant_id:    tenantId,
      })
    } catch (activationErr) {
      // Non-fatal: the account may already be active or the RPC may not exist yet.
      console.error('[auth/callback] activate_pending_customer_account error:', activationErr)
    }
  } else if (!onMainDomain) {
    // Callback is on a storefront domain but no tenant_id in params.
    // Try to derive the tenant from the subdomain and activate.
    try {
      const admin            = getSupabaseServerClient()
      const parts            = hostname.split('.')
      const potentialSlug    = parts.length >= 3 ? parts[0] : null

      if (potentialSlug) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tenant } = await (admin as any)
          .from('tenants')
          .select('id')
          .eq('subdomain', potentialSlug)
          .maybeSingle()

        if (tenant?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any).rpc('activate_pending_customer_account', {
            p_auth_user_id: session.user.id,
            p_tenant_id:    tenant.id,
          })
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // ── Determine safe redirect destination ──────────────────────────────────────
  let destination = next

  if (type === 'recovery') {
    // Password-reset flow — ensure the user lands on the reset-password page.
    const resetPath = '/reset-password'
    destination = safeNext(searchParams.get('next'), resetPath)
    if (!destination.includes('reset-password')) destination = resetPath
  }

  console.info('[auth/callback] redirecting', { destination, host: hostname })

  // Redirect using request origin — preserves subdomain / custom domain.
  const redirectUrl = buildRedirectUrl(request, destination)
  return NextResponse.redirect(redirectUrl)
}
