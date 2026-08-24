// app/api/payments/providers/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { getStripeClientId, getStripePlatformClient } from '@/lib/payments/stripe/server'

const SQUARE_APPLICATION_SECRET = process.env.SQUARE_APPLICATION_SECRET ?? ''
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * POST /api/payments/providers/disconnect
 * Body: { provider_key: 'stripe' | 'square' }
 *
 * Revokes OAuth access at the provider level before marking
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
    return NextResponse.json(
      { error: 'provider_key must be "stripe" or "square"' },
      { status: 400 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Fetch the current account to get the access token for revocation
  const { data: account } = await supabase
    .from('payment_accounts')
    .select('access_token, provider_account_id, connection_method')
    .eq('tenant_id', ctx.tenant_id)
    .eq('provider_key', providerKey)
    .neq('status', 'disconnected')
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Provider connection was not found' }, { status: 404 })
  }

  // Stripe deauthorization is required before local state changes. Square
  // keeps its existing token-revocation behavior.
  if (account.connection_method === 'oauth') {
    try {
      if (providerKey === 'stripe') {
        if (!account.provider_account_id) throw new Error('Stripe account ID is missing')
        await getStripePlatformClient().oauth.deauthorize({
          client_id: getStripeClientId(),
          stripe_user_id: account.provider_account_id,
        })
      } else if (providerKey === 'square' && account.access_token) {
        await revokeSquareToken(account.access_token)
      }
    } catch {
      console.error('[payments:disconnect] Provider deauthorization failed', {
        tenant_id: ctx.tenant_id,
        user_id: ctx.id,
        provider: providerKey,
      })
      await recordCommandAudit({
        tenantId: ctx.tenant_id,
        actorUserId: ctx.id,
        action: `${providerKey}.disconnect.failed`,
        metadata: { provider_account_id: account.provider_account_id },
      })
      return NextResponse.json(
        { error: 'The provider could not be disconnected. Please try again.' },
        { status: 502 }
      )
    }
  }

  // Mark as disconnected locally — wipe tokens for security
  const { error: accountError } = await supabase
    .from('payment_accounts')
    .update({
      status: 'disconnected',
      access_token: null,
      refresh_token: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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

  await recordCommandAudit({
    tenantId: ctx.tenant_id,
    actorUserId: ctx.id,
    action: `${providerKey}.disconnected`,
    metadata: { provider_account_id: account.provider_account_id },
  })

  return NextResponse.json({ success: true, provider: providerKey })
}

async function revokeSquareToken(accessToken: string): Promise<void> {
  if (!SQUARE_APPLICATION_SECRET) return

  const baseUrl = IS_PRODUCTION
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const res = await fetch(`${baseUrl}/oauth2/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-17',
      Authorization: `Client ${SQUARE_APPLICATION_SECRET}`,
    },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Square revoke failed: ${body}`)
  }
}
