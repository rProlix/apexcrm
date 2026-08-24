import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getStripePlatformClient, getStripeWebhookSecret } from '@/lib/payments/stripe/server'
import {
  claimPaymentWebhookEvent,
  completePaymentWebhookEvent,
  failPaymentWebhookEvent,
} from '@/lib/payments/webhookEvents'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripePlatformClient().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret()
    )
  } catch {
    console.warn('[stripe:webhook] signature rejected', {
      category: 'WEBHOOK_SIGNATURE_ERROR',
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const object = event.data.object as unknown as Record<string, unknown>
  const connectedAccountId =
    typeof event.account === 'string'
      ? event.account
      : event.type === 'account.updated' && typeof object.id === 'string'
        ? object.id
        : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  const { data: connection } = connectedAccountId
    ? await database
        .from('payment_accounts')
        .select('tenant_id, provider_account_id, livemode, status')
        .eq('provider_key', 'stripe')
        .eq('provider_account_id', connectedAccountId)
        .neq('status', 'disconnected')
        .maybeSingle()
    : { data: null }

  const tenantId = connection?.tenant_id ?? null
  const claimed = await claimPaymentWebhookEvent({
    providerEventId: event.id,
    connectedAccountId,
    tenantId,
    eventType: event.type,
    livemode: event.livemode,
  })
  if (!claimed) return NextResponse.json({ received: true, duplicate: true })

  if (!tenantId || !connectedAccountId) {
    await failPaymentWebhookEvent(claimed.id, 'WEBHOOK_MAPPING_ERROR')
    console.error('[stripe:webhook] connected account mapping missing', {
      event_id: event.id,
      event_type: event.type,
      stripe_account_id: connectedAccountId,
      category: 'WEBHOOK_MAPPING_ERROR',
    })
    return NextResponse.json({ error: 'Connected account mapping unavailable' }, { status: 500 })
  }
  if (typeof connection.livemode === 'boolean' && connection.livemode !== event.livemode) {
    await failPaymentWebhookEvent(claimed.id, 'MODE_MISMATCH')
    return NextResponse.json({ error: 'Account mode mismatch' }, { status: 409 })
  }

  try {
    await processStripeEvent({ event, object, tenantId, connectedAccountId, database })
    await completePaymentWebhookEvent(claimed.id)
    return NextResponse.json({ received: true })
  } catch (error) {
    const code = error instanceof Error ? error.name : 'PROCESSING_ERROR'
    await failPaymentWebhookEvent(claimed.id, code)
    console.error('[stripe:webhook] processing failed', {
      tenant_id: tenantId,
      stripe_account_id: connectedAccountId,
      event_id: event.id,
      event_type: event.type,
      category: 'PAYMENT_ERROR',
    })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processStripeEvent(input: {
  event: Stripe.Event
  object: Record<string, unknown>
  tenantId: string
  connectedAccountId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any
}): Promise<void> {
  const { event, object, tenantId, connectedAccountId, database } = input

  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      const status = stripeAccountStatus(account)
      const { error } = await database
        .from('payment_accounts')
        .update({
          status,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          last_verified_at: new Date().toISOString(),
          metadata: {
            country: account.country,
            default_currency: account.default_currency,
            requirements_due: account.requirements?.currently_due?.length ?? 0,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('provider_key', 'stripe')
        .eq('provider_account_id', connectedAccountId)
      if (error) throw new Error(`account_update_${error.code}`)
      await database
        .from('payment_providers')
        .update({ is_enabled: status === 'connected', updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('provider_key', 'stripe')
      await recordCommandAudit({
        tenantId,
        actorUserId: null,
        action:
          status === 'action_required'
            ? 'stripe.connection.action_required'
            : 'stripe.connection.verified',
        metadata: { stripe_account_id: connectedAccountId, connection_status: status },
      })
      break
    }
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed': {
      const providerTransactionId = object.id
      if (typeof providerTransactionId !== 'string') break
      const status = event.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed'
      const { error } = await database
        .from('payment_transactions')
        .update({ status })
        .eq('tenant_id', tenantId)
        .eq('provider_key', 'stripe')
        .eq('provider_account_id', connectedAccountId)
        .eq('provider_transaction_id', providerTransactionId)
      if (error) throw new Error(`payment_update_${error.code}`)
      const { data: transaction } = await database
        .from('payment_transactions')
        .select('invoice_id')
        .eq('tenant_id', tenantId)
        .eq('provider_key', 'stripe')
        .eq('provider_account_id', connectedAccountId)
        .eq('provider_transaction_id', providerTransactionId)
        .maybeSingle()
      if (status === 'succeeded' && transaction?.invoice_id) {
        await database
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', transaction.invoice_id)
          .eq('tenant_id', tenantId)
      }
      break
    }
    case 'charge.refunded': {
      const paymentIntentId = object.payment_intent
      if (typeof paymentIntentId !== 'string') break
      const { error } = await database
        .from('payment_transactions')
        .update({ status: 'refunded' })
        .eq('tenant_id', tenantId)
        .eq('provider_key', 'stripe')
        .eq('provider_account_id', connectedAccountId)
        .eq('provider_transaction_id', paymentIntentId)
      if (error) throw new Error(`refund_update_${error.code}`)
      break
    }
    case 'checkout.session.completed': {
      const metadata = (object.metadata ?? {}) as Record<string, string>
      if (metadata.tenant_id && metadata.tenant_id !== tenantId) {
        throw new Error('checkout_tenant_mismatch')
      }
      if (metadata.invoice_id) {
        await database
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', metadata.invoice_id)
          .eq('tenant_id', tenantId)
      }
      if (typeof object.id === 'string') {
        await database
          .from('payment_links')
          .update({ status: 'expired' })
          .eq('provider_link_id', object.id)
          .eq('provider_account_id', connectedAccountId)
          .eq('tenant_id', tenantId)
      }
      break
    }
  }
}

function stripeAccountStatus(account: Stripe.Account): string {
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
