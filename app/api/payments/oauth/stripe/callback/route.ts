// app/api/payments/oauth/stripe/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { verifyState } from '@/lib/payments/oauth/verifyState'

const STRIPE_SECRET_KEY   = process.env.STRIPE_SECRET_KEY   ?? ''
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''
const DASHBOARD_REDIRECT  = `${NEXT_PUBLIC_APP_URL}/payments/providers`

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const code             = searchParams.get('code')
  const stateParam       = searchParams.get('state')
  const errorParam       = searchParams.get('error')
  const errorDesc        = searchParams.get('error_description')

  // Handle user cancellation
  if (errorParam) {
    const msg = errorDesc ?? errorParam
    console.warn('[StripeOAuth] User cancelled or provider error:', msg)
    return NextResponse.redirect(
      `${DASHBOARD_REDIRECT}?error=${encodeURIComponent(msg)}`
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=missing_code_or_state`)
  }

  // Validate CSRF state from cookie
  const cookieStore      = await cookies()
  const cookieState      = cookieStore.get('stripe_oauth_state')?.value ?? ''
  const cookieVerify     = verifyState(cookieState)
  const callbackVerify   = verifyState(stateParam)

  if (!cookieVerify.valid || !callbackVerify.valid) {
    console.error('[StripeOAuth] State validation failed:', cookieVerify.error ?? callbackVerify.error)
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=invalid_state`)
  }

  // Both states must match (compare nonces)
  if (cookieVerify.payload!.nonce !== callbackVerify.payload!.nonce) {
    console.error('[StripeOAuth] State nonce mismatch')
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=state_mismatch`)
  }

  const tenantId = callbackVerify.payload!.tenantId

  // Clear the state cookie immediately
  cookieStore.delete('stripe_oauth_state')

  // Exchange the authorization code for an access token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokenResponse: Record<string, any>
  try {
    const stripe   = new Stripe(STRIPE_SECRET_KEY)
    tokenResponse  = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })
  } catch (err) {
    const msg = (err as Error).message
    console.error('[StripeOAuth] Token exchange failed:', msg)
    return NextResponse.redirect(
      `${DASHBOARD_REDIRECT}?error=${encodeURIComponent('Failed to connect Stripe: ' + msg)}`
    )
  }

  const stripeUserId  = (tokenResponse.stripe_user_id  ?? null) as string | null
  const accessToken   = (tokenResponse.access_token    ?? null) as string | null
  const refreshToken  = (tokenResponse.refresh_token   ?? null) as string | null
  const scope         = (tokenResponse.scope            ?? null) as string | null

  if (!accessToken || !stripeUserId) {
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=no_access_token`)
  }

  // Persist to payment_accounts (upsert by tenant_id + provider_key)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const accountPayload = {
    tenant_id:          tenantId,
    provider_key:       'stripe',
    provider_account_id: stripeUserId,
    access_token:       accessToken,
    refresh_token:      refreshToken,
    scope,
    expires_at:         null,
    status:             'connected',
    connection_method:  'oauth',
    metadata:           { stripe_user_id: stripeUserId, scope },
    updated_at:         new Date().toISOString(),
  }

  const { error: upsertError } = await supabase
    .from('payment_accounts')
    .upsert(accountPayload, {
      onConflict:        'tenant_id,provider_key',
      ignoreDuplicates:  false,
    })

  if (upsertError) {
    console.error('[StripeOAuth] Failed to save account:', upsertError.message)
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=db_error`)
  }

  // Also ensure a payment_providers row exists and is enabled
  await supabase
    .from('payment_providers')
    .upsert(
      {
        tenant_id:    tenantId,
        provider_key: 'stripe',
        is_enabled:   true,
        config:       { connectionMethod: 'oauth', stripeUserId },
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'tenant_id,provider_key', ignoreDuplicates: false }
    )

  return NextResponse.redirect(`${DASHBOARD_REDIRECT}?connected=stripe`)
}
