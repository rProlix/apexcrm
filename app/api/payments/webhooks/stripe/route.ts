// app/api/payments/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { stripeAdapter } from '@/lib/payments/adapters/stripeAdapter'
import { syncProviderEvent, markEventProcessed } from '@/lib/payments/syncProviderEvent'

/**
 * Stripe webhook handler.
 *
 * Stripe sends all events to a single endpoint. We resolve the tenant by
 * looking up the payment_providers row whose webhookSecret matches the
 * Stripe-Signature header (or by tenant_id embedded in event metadata).
 *
 * Idempotency: payment_events de-duplicates by event id.
 */
export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Try each enabled Stripe provider row to find the matching webhook secret
  const { data: providers } = await supabase
    .from('payment_providers')
    .select('tenant_id, config')
    .eq('provider_key', 'stripe')
    .eq('is_enabled', true)

  let webhookEvent: Awaited<ReturnType<typeof stripeAdapter.handleWebhook>> | null = null
  let matchedTenantId: string | null = null

  for (const provider of providers ?? []) {
    const cfg = (provider.config ?? {}) as Record<string, string>
    if (!cfg.webhookSecret) continue

    try {
      webhookEvent = await stripeAdapter.handleWebhook(rawBody, signature, {
        secretKey:     cfg.secretKey,
        webhookSecret: cfg.webhookSecret,
      })
      matchedTenantId = provider.tenant_id
      break
    } catch {
      // Wrong secret — try next
    }
  }

  if (!webhookEvent) {
    console.warn('[stripe/webhook] No matching provider found for this signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Prefer tenant_id from event metadata (set during payment creation)
  const tenantId = webhookEvent.tenantId ?? matchedTenantId

  if (!tenantId) {
    console.error('[stripe/webhook] Could not determine tenant_id for event', webhookEvent.eventType)
    return NextResponse.json({ received: true })  // ACK to avoid Stripe retries
  }

  // Persist event (idempotent via external id)
  const eventId = await syncProviderEvent({
    tenantId,
    providerKey:    'stripe',
    eventType:       webhookEvent.eventType,
    payload:         webhookEvent.raw as Record<string, unknown>,
    idempotencyKey: webhookEvent.externalId,
  })

  if (!eventId) {
    // Already processed — return 200 to prevent Stripe retry
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── Event processing ────────────────────────────────────────────────────────
  try {
    switch (webhookEvent.eventType) {
      case 'payment_intent.succeeded': {
        const raw  = webhookEvent.raw as Record<string, unknown>
        const data = raw.data as Record<string, unknown>
        const obj  = data?.object as Record<string, unknown>
        const providerTxId = obj?.id as string | undefined

        if (providerTxId) {
          await supabase
            .from('payment_transactions')
            .update({ status: 'succeeded' })
            .eq('tenant_id', tenantId)
            .eq('provider_transaction_id', providerTxId)

          // Mark associated invoice as paid
          const { data: tx } = await supabase
            .from('payment_transactions')
            .select('invoice_id')
            .eq('provider_transaction_id', providerTxId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

          if (tx?.invoice_id) {
            await supabase
              .from('invoices')
              .update({ status: 'paid' })
              .eq('id', tx.invoice_id)
              .eq('tenant_id', tenantId)
          }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const raw  = webhookEvent.raw as Record<string, unknown>
        const data = raw.data as Record<string, unknown>
        const obj  = data?.object as Record<string, unknown>
        const providerTxId = obj?.id as string | undefined

        if (providerTxId) {
          await supabase
            .from('payment_transactions')
            .update({ status: 'failed' })
            .eq('tenant_id', tenantId)
            .eq('provider_transaction_id', providerTxId)
        }
        break
      }

      case 'charge.refunded': {
        const raw    = webhookEvent.raw as Record<string, unknown>
        const data   = raw.data as Record<string, unknown>
        const obj    = data?.object as Record<string, unknown>
        const intent = obj?.payment_intent as string | undefined

        if (intent) {
          await supabase
            .from('payment_transactions')
            .update({ status: 'refunded' })
            .eq('tenant_id', tenantId)
            .eq('provider_transaction_id', intent)
        }
        break
      }

      case 'checkout.session.completed': {
        const raw     = webhookEvent.raw as Record<string, unknown>
        const data    = raw.data as Record<string, unknown>
        const obj     = data?.object as Record<string, unknown>
        const meta    = (obj?.metadata ?? {}) as Record<string, string>
        const linkId  = obj?.id as string | undefined

        if (meta.invoice_id) {
          await supabase
            .from('invoices')
            .update({ status: 'paid' })
            .eq('id', meta.invoice_id)
            .eq('tenant_id', tenantId)
        }

        if (linkId) {
          await supabase
            .from('payment_links')
            .update({ status: 'expired' })
            .eq('provider_link_id', linkId)
            .eq('tenant_id', tenantId)
        }
        break
      }
    }

    await markEventProcessed(eventId)
  } catch (err) {
    console.error('[stripe/webhook] Processing error:', (err as Error).message)
    // Still return 200 to acknowledge receipt — retry logic is up to us
  }

  return NextResponse.json({ received: true })
}
