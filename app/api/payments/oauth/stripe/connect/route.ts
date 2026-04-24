// app/api/payments/oauth/stripe/connect/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUserContext } from '@/lib/auth/getUserContext'
import { generateState } from '@/lib/payments/oauth/generateState'

const STRIPE_CLIENT_ID    = process.env.STRIPE_CLIENT_ID
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

export async function GET(): Promise<NextResponse> {
  const ctx = await getUserContext()

  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!ctx.tenant_id) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 400 })
  }

  if (!STRIPE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Stripe OAuth is not configured (missing STRIPE_CLIENT_ID)' },
      { status: 503 }
    )
  }

  const state       = generateState(ctx.tenant_id, 'stripe')
  const redirectUri = `${NEXT_PUBLIC_APP_URL}/api/payments/oauth/stripe/callback`

  // Store state in a short-lived httpOnly cookie for CSRF validation
  const cookieStore = cookies()
  cookieStore.set('stripe_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutes
    path:     '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     STRIPE_CLIENT_ID,
    scope:         'read_write',
    redirect_uri:  redirectUri,
    state,
  })

  const url = `https://connect.stripe.com/oauth/authorize?${params.toString()}`

  return NextResponse.redirect(url)
}
