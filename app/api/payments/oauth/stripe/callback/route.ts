import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { consumeOAuthState } from '@/lib/payments/oauth/stateStore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { StripeIntegrationError } from '@/lib/payments/stripe/errors'
import {
  getStripePlatformClient,
  isStripeModeCompatible,
  stripePaymentsUrl,
} from '@/lib/payments/stripe/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const context = await getUserContext()
  if (!context) return NextResponse.redirect(stripePaymentsUrl({ error: 'authorization_required' }))

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error')
  if (oauthError) {
    return NextResponse.redirect(
      stripePaymentsUrl({
        error: oauthError === 'access_denied' ? 'access_denied' : 'exchange_failed',
      })
    )
  }
  if (!code || !state) return NextResponse.redirect(stripePaymentsUrl({ error: 'invalid_state' }))

  let tenantId = context.tenant_id ?? ''
  try {
    const consumed = await consumeOAuthState({ state, provider: 'stripe', userId: context.id })
    tenantId = consumed.tenantId
    if (context.tenant_id !== tenantId || !['owner', 'admin'].includes(context.role)) {
      throw new StripeIntegrationError(
        'AUTHORIZATION_ERROR',
        'OAuth state does not match the authenticated tenant.',
        'invalid_state'
      )
    }

    const stripe = getStripePlatformClient()
    const tokenResponse = await stripe.oauth.token({ grant_type: 'authorization_code', code })
    if (!tokenResponse.stripe_user_id) {
      throw new StripeIntegrationError(
        'OAUTH_EXCHANGE_ERROR',
        'Stripe did not return a connected account ID.',
        'exchange_failed'
      )
    }
    const livemode = tokenResponse.livemode === true
    if (!isStripeModeCompatible(livemode)) {
      throw new StripeIntegrationError(
        'CONFIGURATION_ERROR',
        'Stripe OAuth mode does not match the platform key mode.',
        'mode_mismatch'
      )
    }

    const stripeAccountId = tokenResponse.stripe_user_id
    const account = await stripe.accounts.retrieve(stripeAccountId)
    if ('deleted' in account && account.deleted) {
      throw new StripeIntegrationError(
        'ACCOUNT_RESTRICTED',
        'Stripe returned a deleted connected account.',
        'account_restricted'
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = getSupabaseServerClient() as any
    const { data: conflict } = await database
      .from('payment_accounts')
      .select('tenant_id')
      .eq('provider_key', 'stripe')
      .eq('provider_account_id', stripeAccountId)
      .neq('tenant_id', tenantId)
      .maybeSingle()
    if (conflict) {
      throw new StripeIntegrationError(
        'ACCOUNT_CONFLICT',
        'Stripe account is already connected to another tenant.',
        'account_conflict'
      )
    }
    const { data: previousConnection } = await database
      .from('payment_accounts')
      .select('provider_account_id')
      .eq('tenant_id', tenantId)
      .eq('provider_key', 'stripe')
      .maybeSingle()

    const status = deriveStripeConnectionStatus(account)
    const { error: connectionError } = await database.rpc('connect_stripe_account', {
      p_tenant_id: tenantId,
      p_user_id: context.id,
      p_account_id: stripeAccountId,
      p_livemode: livemode,
      p_status: status,
      p_charges_enabled: account.charges_enabled,
      p_payouts_enabled: account.payouts_enabled,
      p_details_submitted: account.details_submitted,
      p_scope: tokenResponse.scope ?? 'read_write',
      p_metadata: {
        country: account.country,
        default_currency: account.default_currency,
        requirements_due: account.requirements?.currently_due?.length ?? 0,
      },
    })
    if (connectionError) {
      throw new StripeIntegrationError(
        'UNKNOWN_PROVIDER_ERROR',
        `Stripe connection could not be persisted: ${connectionError.code}`,
        'persistence_failed'
      )
    }

    await recordCommandAudit({
      tenantId,
      actorUserId: context.id,
      action: previousConnection?.provider_account_id
        ? previousConnection.provider_account_id === stripeAccountId
          ? 'stripe.reconnected'
          : 'stripe.account.changed'
        : 'stripe.connect.completed',
      metadata: {
        stripe_account_id: stripeAccountId,
        previous_stripe_account_id: previousConnection?.provider_account_id ?? null,
        connection_status: status,
        livemode,
      },
    })
    return NextResponse.redirect(stripePaymentsUrl({ connected: 'stripe' }))
  } catch (error) {
    const safeCode = error instanceof StripeIntegrationError ? error.safeCode : 'exchange_failed'
    console.error('[stripe:callback] connection failed', {
      tenant_id: tenantId || null,
      user_id: context.id,
      category: error instanceof StripeIntegrationError ? error.category : 'UNKNOWN_PROVIDER_ERROR',
    })
    if (tenantId) {
      await recordCommandAudit({
        tenantId,
        actorUserId: context.id,
        action: 'stripe.connect.failed',
        metadata: { error_code: safeCode },
      })
    }
    return NextResponse.redirect(stripePaymentsUrl({ error: safeCode }))
  }
}

function deriveStripeConnectionStatus(account: {
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  requirements?: { currently_due?: string[] | null; disabled_reason?: string | null } | null
}): string {
  if (account.charges_enabled && account.payouts_enabled) return 'connected'
  if (
    !account.details_submitted ||
    account.requirements?.disabled_reason ||
    (account.requirements?.currently_due?.length ?? 0) > 0
  ) {
    return 'action_required'
  }
  return 'restricted'
}
