// app/api/payments/providers/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STRIPE_SECRET_KEY         = process.env.STRIPE_SECRET_KEY         ?? ''
const SQUARE_APPLICATION_SECRET = process.env.SQUARE_APPLICATION_SECRET ?? ''
const IS_PRODUCTION             = process.env.NODE_ENV === 'production'

/**
 * POST /api/payments/providers/disconnect
 * Body: { provider_key: 'stripe' | 'square' }
 *
 * Revokes the OAuth token at the provider level (best-effort) then marks
 * the local account as disconnected. Also disables the payment_providers row.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!ctx.tenant_id) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 400 })
  }

  let body: { provider_key?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const providerKey = body.provider_key
  if (!providerKey || !['stripe', 'square'].includes(providerKey)) {
    return NextResponse.json({ error: 'provider_key must be "stripe" or "square"' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Fetch the current account to get the access token for revocation
  const { data: account } = await supabase
    .from('payment_accounts')
    .select('access_token, provider_account_id, connection_method')
    .eq('tenant_id', ctx.tenant_id)
    .eq('provider_key', providerKey)
    .eq('status', 'connected')
    .maybeSingle()

  // Best-effort token revocation at the provider
  if (account?.access_token && account?.connection_method === 'oauth') {
    try {
      if (providerKey === 'stripe') {
        await revokeStripeToken(account.access_token)
      } else if (providerKey === 'square') {
        await revokeSquareToken(account.access_token)
      }
    } catch (err) {
      // Non-fatal — we still deactivate locally
      console.warn(`[Disconnect] Token revocation failed for ${providerKey}:`, (err as Error).message)
    }
  }

  // Mark as disconnected locally — wipe tokens for security
  const { error: accountError } = await supabase
    .from('payment_accounts')
    .update({
      status:        'disconnected',
      access_token:  null,
      refresh_token: null,
      updated_at:    new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenant_id)
    .eq('provider_key', providerKey)

  if (accountError) {
    console.error('[Disconnect] Failed to update payment_accounts:', accountError.message)
    return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 })
  }

  // Disable the payment_providers row
  await supabase
    .from('payment_providers')
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('provider_key', providerKey)

  return NextResponse.json({ success: true, provider: providerKey })
}

async function revokeStripeToken(accessToken: string): Promise<void> {
  if (!STRIPE_SECRET_KEY) return

  const res = await fetch('https://connect.stripe.com/oauth/deauthorize', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id:         process.env.STRIPE_CLIENT_ID ?? '',
      stripe_user_id:    accessToken,
    }).toString(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Stripe deauthorize failed: ${body}`)
  }
}

async function revokeSquareToken(accessToken: string): Promise<void> {
  if (!SQUARE_APPLICATION_SECRET) return

  const baseUrl = IS_PRODUCTION
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const res = await fetch(`${baseUrl}/oauth2/revoke`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Square-Version': '2024-01-17',
      Authorization:   `Client ${SQUARE_APPLICATION_SECRET}`,
    },
    body: JSON.stringify({
      client_id:    process.env.SQUARE_APPLICATION_ID,
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Square revoke failed: ${body}`)
  }
}
