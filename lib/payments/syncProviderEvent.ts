// lib/payments/syncProviderEvent.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface SyncEventParams {
  tenantId:    string
  providerKey: string
  eventType:   string
  payload:     Record<string, unknown>
  /** If provided, the event is idempotently de-duplicated by this key (stored in payload.idempotency_key) */
  idempotencyKey?: string
}

/**
 * Persists a provider event to payment_events in an idempotent way.
 * If idempotencyKey is provided, a duplicate event with the same key is
 * silently skipped (no duplicate writes).
 *
 * Returns the event id, or null if the event was a duplicate skip.
 */
export async function syncProviderEvent(params: SyncEventParams): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Idempotency check: skip if we've already processed this exact event
  if (params.idempotencyKey) {
    const { data: existing } = await supabase
      .from('payment_events')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('provider_key', params.providerKey)
      .eq('event_type', params.eventType)
      .contains('payload', { idempotency_key: params.idempotencyKey })
      .maybeSingle()

    if (existing) {
      console.log(`[syncProviderEvent] Duplicate event skipped: ${params.idempotencyKey}`)
      return null
    }
  }

  const payload = params.idempotencyKey
    ? { ...params.payload, idempotency_key: params.idempotencyKey }
    : params.payload

  const { data, error } = await supabase
    .from('payment_events')
    .insert({
      tenant_id:   params.tenantId,
      provider_key: params.providerKey,
      event_type:  params.eventType,
      payload,
      processed:   false,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[syncProviderEvent] Failed to persist event:', error.message)
    return null
  }

  return data.id
}

/**
 * Mark a payment_event as processed.
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  await supabase
    .from('payment_events')
    .update({ processed: true })
    .eq('id', eventId)
}
