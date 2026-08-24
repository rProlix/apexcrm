import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function claimPaymentWebhookEvent(input: {
  providerEventId: string
  connectedAccountId: string | null
  tenantId: string | null
  eventType: string
  livemode: boolean
}): Promise<{ id: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  const { data, error } = await database
    .from('payment_webhook_events')
    .insert({
      provider: 'stripe',
      provider_event_id: input.providerEventId,
      connected_account_id: input.connectedAccountId,
      tenant_id: input.tenantId,
      event_type: input.eventType,
      livemode: input.livemode,
      status: 'processing',
      attempt_count: 1,
    })
    .select('id')
    .single()

  if (error?.code === '23505') {
    const { data: existing } = await database
      .from('payment_webhook_events')
      .select('id, status, attempt_count, updated_at')
      .eq('provider', 'stripe')
      .eq('provider_event_id', input.providerEventId)
      .maybeSingle()
    if (!existing || existing.status === 'processed') return null
    const staleProcessing =
      existing.status === 'processing' &&
      Date.now() - new Date(existing.updated_at).getTime() > 5 * 60 * 1000
    if (existing.status === 'processing' && !staleProcessing) return null
    const { data: retried, error: retryError } = await database
      .from('payment_webhook_events')
      .update({
        status: 'processing',
        attempt_count: Number(existing.attempt_count ?? 1) + 1,
        error_code: null,
        tenant_id: input.tenantId,
        connected_account_id: input.connectedAccountId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .select('id')
      .maybeSingle()
    if (retryError || !retried) return null
    return retried
  }
  if (error || !data) throw new Error(`Webhook event claim failed: ${error?.code ?? 'unknown'}`)
  return data
}

export async function completePaymentWebhookEvent(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  await database
    .from('payment_webhook_events')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function failPaymentWebhookEvent(id: string, errorCode: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  await database
    .from('payment_webhook_events')
    .update({
      status: 'failed',
      error_code: errorCode.slice(0, 120),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}
