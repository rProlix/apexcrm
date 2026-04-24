// app/api/payments/oauth/square/connect/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUserContext } from '@/lib/auth/getUserContext'
import { generateState } from '@/lib/payments/oauth/generateState'

const SQUARE_APPLICATION_ID = process.env.SQUARE_APPLICATION_ID
const NEXT_PUBLIC_APP_URL   = process.env.NEXT_PUBLIC_APP_URL ?? ''
const IS_PRODUCTION         = process.env.NODE_ENV === 'production'

export async function GET(): Promise<NextResponse> {
  const ctx = await getUserContext()

  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!ctx.tenant_id) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 400 })
  }

  if (!SQUARE_APPLICATION_ID) {
    return NextResponse.json(
      { error: 'Square OAuth is not configured (missing SQUARE_APPLICATION_ID)' },
      { status: 503 }
    )
  }

  const state        = generateState(ctx.tenant_id, 'square')
  const redirectUri  = `${NEXT_PUBLIC_APP_URL}/api/payments/oauth/square/callback`

  const cookieStore = await cookies()
  cookieStore.set('square_oauth_state', state, {
    httpOnly: true,
    secure:   IS_PRODUCTION,
    sameSite: 'lax',
    maxAge:   600,
    path:     '/',
  })

  const baseUrl = IS_PRODUCTION
    ? 'https://connect.squareup.com/oauth2/authorize'
    : 'https://connect.squareupsandbox.com/oauth2/authorize'

  const params = new URLSearchParams({
    client_id:    SQUARE_APPLICATION_ID,
    scope:        'MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE ORDERS_READ ORDERS_WRITE INVOICES_READ INVOICES_WRITE REFUNDS_READ',
    session:      'false',
    state,
    redirect_uri: redirectUri,
  })

  return NextResponse.redirect(`${baseUrl}?${params.toString()}`)
}
