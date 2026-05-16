// app/auth/callback/route.ts
//
// Handles the Supabase Auth PKCE confirmation callback for:
//   - CRM business owner / staff email confirmation
//   - Customer storefront email confirmation
//   - Password reset link (when Supabase redirects here)
//
// Supabase sends users here after they click a confirmation or reset email link:
//   https://your-domain.com/auth/callback?code=<pkce-code>&next=/destination
//
// IMPORTANT:
//   1. Never redirect to localhost in production.
//   2. Always sanitise the `next` param — only allow relative paths.
//   3. After code exchange, activate pending customer_accounts for the tenant.
//   4. Preserve session cookies across subdomains (handled by createSessionServerClient).
//
// Supabase Dashboard settings that MUST be configured (do this once):
//   Authentication → URL Configuration
//     Site URL:  https://nexoranow.com
//     Additional Redirect URLs:
//       https://nexoranow.com/auth/callback
//       https://*.nexoranow.com/auth/callback
//       (Add Vercel preview pattern if needed: https://*.vercel.app/auth/callback)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

// Only allow relative, same-origin redirect paths (no open redirects).
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  const decoded = decodeURIComponent(raw)
  // Must start with exactly one '/' and not be a protocol-relative URL
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback
  return decoded
}

// Build the final redirect URL.
// We must use the request's own origin so that redirects work on:
//   - nexoranow.com  (main CRM domain)
//   - tenant.nexoranow.com  (tenant subdomain)
//   - Vercel preview URLs
//   - Custom business domains
function buildRedirectUrl(request: NextRequest, path: string): URL {
  const url = new URL(request.url)
  return new URL(path, url.origin)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const code     = searchParams.get('code')
  const next     = safeNext(searchParams.get('next'), '/account')
  const tenantId = searchParams.get('tenant_id')

  // Edge case: Supabase password reset sends `type=recovery` instead of code sometimes.
  // Handle both flows.
  const type = searchParams.get('type')

  if (!code) {
    // No code — this may be a broken link or a direct visit.
    // Redirect to login with an error hint.
    const loginUrl = buildRedirectUrl(request, '/login')
    loginUrl.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(loginUrl)
  }

  // Exchange the PKCE code for a session. This sets the auth cookies.
  const supabase = await createSessionServerClient()
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session) {
    console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
    const loginUrl = buildRedirectUrl(request, '/login')
    loginUrl.searchParams.set('error', 'confirmation_failed')
    loginUrl.searchParams.set('message', error?.message ?? 'Link expired or already used.')
    return NextResponse.redirect(loginUrl)
  }

  // ── Activate pending customer account ─────────────────────────────────────
  //
  // When a customer signs up from a business website, their customer_accounts
  // row is created with status='pending_confirmation'. After the code exchange
  // above, Supabase has confirmed their email — activate the account now.
  //
  // We also try to derive the tenant from the callback URL if not in params.

  if (tenantId) {
    try {
      const admin = getSupabaseServerClient()
      // Use the RPC added in migration 066. Cast to any because the generated
      // Supabase types file doesn't include this function yet (it requires a
      // `supabase gen types` run after the migration is applied).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).rpc('activate_pending_customer_account', {
        p_auth_user_id: session.user.id,
        p_tenant_id:    tenantId,
      })
    } catch (activationErr) {
      // Non-fatal: the account may already be active, or the RPC may not exist yet.
      // Log and continue — we never block login on a failed activation.
      console.error('[auth/callback] activate_pending_customer_account error:', activationErr)
    }
  }

  // ── Determine safe redirect destination ──────────────────────────────────
  //
  // Password reset flow: `type=recovery` → go to reset-password page.
  // Normal confirmation: go to the `next` path.

  let destination = next

  if (type === 'recovery') {
    // User came from a password-reset email.
    // The session is temporarily valid only for updateUser(); send to the
    // reset-password page so they can set a new password.
    const resetPath = tenantId ? '/reset-password' : '/reset-password'
    destination = safeNext(searchParams.get('next'), resetPath)
    if (!destination.includes('reset-password')) {
      destination = resetPath
    }
  }

  // Redirect to the destination — using request origin ensures correct domain.
  const redirectUrl = buildRedirectUrl(request, destination)
  return NextResponse.redirect(redirectUrl)
}
