// app/auth/callback/route.ts
//
// Handles the Supabase Auth PKCE confirmation callback for:
//   - Customer storefront email confirmation (subdomain or custom domain)
//   - CRM business owner / staff email confirmation
//   - Password reset (type=recovery)
//
// How it works:
//   Supabase sends the user here after they click a confirmation or reset link:
//     https://your-domain.com/auth/callback?code=<pkce-code>&next=/destination
//
//   1. The middleware passes /auth/callback through unchanged for subdomain
//      requests (added in middleware.ts), so this route always runs.
//   2. request.url contains the full URL including the exact host the user
//      opened — whether that's erickvcontacf.nexoranow.com or nexoranow.com.
//   3. All post-auth redirects are built from new URL(request.url).origin,
//      so the user always stays on the same domain.
//
// Expected behavior:
//   https://erickvcontacf.nexoranow.com/auth/callback?code=…&next=%2Faccount
//     → redirects to: https://erickvcontacf.nexoranow.com/account
//
//   https://nexoranow.com/auth/callback?code=…&next=%2Fdashboard
//     → redirects to: https://nexoranow.com/dashboard

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeNextPath, isMainCrmHost } from '@/lib/auth/redirects'

export async function GET(request: NextRequest) {
  const requestUrl  = new URL(request.url)
  const { hostname, origin } = requestUrl
  const searchParams = requestUrl.searchParams

  const code     = searchParams.get('code')
  const tenantId = searchParams.get('tenant_id')
  const type     = searchParams.get('type')

  // Choose the correct default destination based on which domain received the callback.
  // Storefront subdomains default to /account; the main CRM domain defaults to /dashboard.
  const onMainDomain = isMainCrmHost(hostname)
  const defaultNext  = onMainDomain ? '/dashboard' : '/account'
  const next         = sanitizeNextPath(searchParams.get('next'), defaultNext)

  console.info('[auth/callback]', {
    host:      hostname,
    type:      type ?? 'signup_confirmation',
    next,
    tenantId:  tenantId ?? null,
    onMainDomain,
  })

  // ── No code ──────────────────────────────────────────────────────────────────
  if (!code) {
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(loginUrl)
  }

  // ── Exchange PKCE code for a session ─────────────────────────────────────────
  const supabase = await createSessionServerClient()
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session) {
    console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', 'confirmation_failed')
    loginUrl.searchParams.set('message', error?.message ?? 'Link expired or already used.')
    return NextResponse.redirect(loginUrl)
  }

  // ── Activate pending customer_accounts row ────────────────────────────────────
  //
  // When a storefront customer signs up, customer_accounts is inserted with
  // status='pending_confirmation'. Now that the code was exchanged successfully
  // (Supabase confirmed the email), activate the row.

  const effectiveTenantId = tenantId ?? await resolveTenantFromSubdomain(hostname)

  if (effectiveTenantId) {
    try {
      const admin = getSupabaseServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).rpc('activate_pending_customer_account', {
        p_auth_user_id: session.user.id,
        p_tenant_id:    effectiveTenantId,
      })
    } catch (activationErr) {
      // Non-fatal — the account may already be active; login still works.
      console.error('[auth/callback] activate_pending_customer_account:', activationErr)
    }
  }

  // ── Determine redirect destination ───────────────────────────────────────────
  let destination = next

  if (type === 'recovery') {
    const resetNext = sanitizeNextPath(searchParams.get('next'), '/reset-password')
    destination = resetNext.includes('reset-password') ? resetNext : '/reset-password'
  }

  console.info('[auth/callback] → redirecting to', `${origin}${destination}`)

  // Always redirect within the same origin so storefront users stay on the subdomain.
  return NextResponse.redirect(new URL(destination, origin))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * When tenant_id is absent from the callback URL, try to look it up by subdomain.
 * Non-fatal — returns null if not found.
 */
async function resolveTenantFromSubdomain(hostname: string): Promise<string | null> {
  try {
    const parts  = hostname.split('.')
    const slug   = parts.length >= 3 ? parts[0] : null
    if (!slug) return null

    const admin = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from('tenants')
      .select('id')
      .eq('subdomain', slug)
      .maybeSingle()

    return data?.id ?? null
  } catch {
    return null
  }
}
