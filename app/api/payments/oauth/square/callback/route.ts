// app/api/payments/oauth/square/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { verifyState } from '@/lib/payments/oauth/verifyState'

const SQUARE_APPLICATION_ID     = process.env.SQUARE_APPLICATION_ID     ?? ''
const SQUARE_APPLICATION_SECRET = process.env.SQUARE_APPLICATION_SECRET ?? ''
const NEXT_PUBLIC_APP_URL       = process.env.NEXT_PUBLIC_APP_URL       ?? ''
const IS_PRODUCTION             = process.env.NODE_ENV === 'production'
const DASHBOARD_REDIRECT        = `${NEXT_PUBLIC_APP_URL}/payments/providers`

interface SquareTokenResponse {
  access_token?:  string
  refresh_token?: string
  expires_at?:    string
  merchant_id?:   string
  token_type?:    string
  short_lived?:   boolean
  error?:         string
  message?:       string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const code             = searchParams.get('code')
  const stateParam       = searchParams.get('state')
  const errorParam       = searchParams.get('error')

  if (errorParam) {
    console.warn('[SquareOAuth] Provider error:', errorParam)
    return NextResponse.redirect(
      `${DASHBOARD_REDIRECT}?error=${encodeURIComponent(errorParam)}`
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=missing_code_or_state`)
  }

  // CSRF validation
  const cookieStore    = cookies()
  const cookieState    = cookieStore.get('square_oauth_state')?.value ?? ''
  const cookieVerify   = verifyState(cookieState)
  const callbackVerify = verifyState(stateParam)

  if (!cookieVerify.valid || !callbackVerify.valid) {
    console.error('[SquareOAuth] State validation failed:', cookieVerify.error ?? callbackVerify.error)
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=invalid_state`)
  }

  if (cookieVerify.payload!.nonce !== callbackVerify.payload!.nonce) {
    console.error('[SquareOAuth] State nonce mismatch')
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=state_mismatch`)
  }

  const tenantId = callbackVerify.payload!.tenantId
  cookieStore.delete('square_oauth_state')

  // Exchange authorization code for access token
  const tokenUrl = IS_PRODUCTION
    ? 'https://connect.squareup.com/oauth2/token'
    : 'https://connect.squareupsandbox.com/oauth2/token'

  let tokenData: SquareTokenResponse
  try {
    const res = await fetch(tokenUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Square-Version': '2024-01-17',
        'Authorization': `Client ${SQUARE_APPLICATION_SECRET}`,
      },
      body: JSON.stringify({
        client_id:     SQUARE_APPLICATION_ID,
        client_secret: SQUARE_APPLICATION_SECRET,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  `${NEXT_PUBLIC_APP_URL}/api/payments/oauth/square/callback`,
      }),
    })

    tokenData = await res.json() as SquareTokenResponse

    if (!res.ok || tokenData.error) {
      throw new Error(tokenData.message ?? tokenData.error ?? 'Token exchange failed')
    }
  } catch (err) {
    const msg = (err as Error).message
    console.error('[SquareOAuth] Token exchange failed:', msg)
    return NextResponse.redirect(
      `${DASHBOARD_REDIRECT}?error=${encodeURIComponent('Failed to connect Square: ' + msg)}`
    )
  }

  const { access_token, refresh_token, expires_at, merchant_id } = tokenData

  if (!access_token) {
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=no_access_token`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const accountPayload = {
    tenant_id:          tenantId,
    provider_key:       'square',
    provider_account_id: merchant_id ?? null,
    access_token,
    refresh_token:      refresh_token ?? null,
    scope:              'PAYMENTS_WRITE ORDERS_WRITE INVOICES_WRITE REFUNDS_READ',
    expires_at:         expires_at   ?? null,
    status:             'connected',
    connection_method:  'oauth',
    metadata:           { merchant_id: merchant_id ?? null, short_lived: tokenData.short_lived ?? false },
    updated_at:         new Date().toISOString(),
  }

  const { error: upsertError } = await supabase
    .from('payment_accounts')
    .upsert(accountPayload, {
      onConflict:       'tenant_id,provider_key',
      ignoreDuplicates: false,
    })

  if (upsertError) {
    console.error('[SquareOAuth] Failed to save account:', upsertError.message)
    return NextResponse.redirect(`${DASHBOARD_REDIRECT}?error=db_error`)
  }

  await supabase
    .from('payment_providers')
    .upsert(
      {
        tenant_id:    tenantId,
        provider_key: 'square',
        is_enabled:   true,
        config:       { connectionMethod: 'oauth', merchantId: merchant_id },
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'tenant_id,provider_key', ignoreDuplicates: false }
    )

  return NextResponse.redirect(`${DASHBOARD_REDIRECT}?connected=square`)
}
