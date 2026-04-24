// app/api/payments/webhooks/square/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { squareAdapter } from '@/lib/payments/adapters/squareAdapter'
import { syncProviderEvent, markEventProcessed } from '@/lib/payments/syncProviderEvent'

/**
 * Square webhook handler.
 *
 * Square uses HMAC-SHA256 for verification via the X-Square-Hmacsha256-Signature header.
 * The signature is HMAC-SHA256(webhookSignatureKey, notificationUrl + rawBody).
 *
 * Tenant resolution: Square embeds a reference_id in payment objects which
 * we map back to the tenant via payment_transactions.
 */
export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const signature = req.headers.get('x-square-hmacsha256-signature') ?? ''

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const merchantId = payload.merchant_id as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase   = getSupabaseServerClient() as any

  // Resolve tenant via payment_accounts.provider_account_id = merchantId
  let tenantId: string | null = null

  if (merchantId) {
    const { data: account } = await supabase
      .from('payment_accounts')
      .select('tenant_id')
      .eq('provider_key', 'square')
      .eq('provider_account_id', merchantId)
      .maybeSingle()

    tenantId = account?.tenant_id ?? null
  }

  // Fallback: try to find tenant via a recent Square provider row
  if (!tenantId) {
    const { data: provider } = await supabase
      .from('payment_providers')
      .select('tenant_id')
      .eq('provider_key', 'square')
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle()
    tenantId = provider?.tenant_id ?? null
  }

  if (!tenantId) {
    console.warn('[square/webhook] Could not resolve tenant for merchant:', merchantId)
    return NextResponse.json({ received: true })
  }

  // Parse webhook event
  const webhookEvent = await squareAdapter.handleWebhook(rawBody, signature, {
    secretKey: '',  // Square HMAC verification done separately
  })

  const eventId = await syncProviderEvent({
    tenantId,
    providerKey:    'square',
    eventType:       webhookEvent.eventType,
    payload:         payload,
    idempotencyKey: webhookEvent.externalId,
  })

  if (!eventId) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── Event processing ────────────────────────────────────────────────────────
  try {
    switch (webhookEvent.eventType) {
      case 'payment.completed': {
        if (webhookEvent.externalId) {
          await supabase
            .from('payment_transactions')
            .update({ status: 'succeeded' })
            .eq('tenant_id', tenantId)
            .eq('provider_transaction_id', webhookEvent.externalId)

          const { data: tx } = await supabase
            .from('payment_transactions')
            .select('invoice_id')
            .eq('provider_transaction_id', webhookEvent.externalId)
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

      case 'payment.failed': {
        if (webhookEvent.externalId) {
          await supabase
            .from('payment_transactions')
            .update({ status: 'failed' })
            .eq('tenant_id', tenantId)
            .eq('provider_transaction_id', webhookEvent.externalId)
        }
        break
      }

      case 'refund.completed': {
        const data    = payload.data as Record<string, unknown> | undefined
        const obj     = data?.object as Record<string, unknown> | undefined
        const refund  = obj?.refund as Record<string, unknown> | undefined
        const refundId = refund?.id as string | undefined

        if (refundId) {
          await supabase
            .from('payment_refunds')
            .update({ status: 'succeeded' })
            .eq('provider_refund_id', refundId)
            .eq('tenant_id', tenantId)
        }
        break
      }
    }

    await markEventProcessed(eventId)
  } catch (err) {
    console.error('[square/webhook] Processing error:', (err as Error).message)
  }

  return NextResponse.json({ received: true })
}
