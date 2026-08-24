import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { StripeIntegrationError } from '@/lib/payments/stripe/errors'
import { hashOAuthState, sanitizePaymentReturnPath } from './security'

export { createOpaqueOAuthState, hashOAuthState } from './security'

const STATE_TTL_MS = 10 * 60 * 1000

export interface ConsumedOAuthState {
  tenantId: string
  userId: string
  returnPath: string
}

export async function persistOAuthState(input: {
  state: string
  tenantId: string
  userId: string
  provider: 'stripe' | 'square'
  returnPath?: string | null
}): Promise<void> {
  // Generated database types intentionally lag forward-only migrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  const stateHash = hashOAuthState(input.state)
  await database.from('payment_oauth_states').delete().lt('expires_at', new Date().toISOString())
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()
  const { error } = await database.from('payment_oauth_states').insert({
    state: stateHash,
    state_hash: stateHash,
    tenant_id: input.tenantId,
    user_id: input.userId,
    provider: input.provider,
    return_path: sanitizePaymentReturnPath(input.returnPath ?? null),
    expires_at: expiresAt,
  })
  if (error) {
    throw new StripeIntegrationError(
      'OAUTH_STATE_ERROR',
      `OAuth state could not be persisted: ${error.code}`,
      'state_persistence_failed'
    )
  }
}

export async function consumeOAuthState(input: {
  state: string
  provider: 'stripe' | 'square'
  userId: string
}): Promise<ConsumedOAuthState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  const stateHash = hashOAuthState(input.state)
  const { data, error } = await database.rpc('consume_payment_oauth_state', {
    p_state_hash: stateHash,
    p_provider: input.provider,
    p_user_id: input.userId,
  })
  const row = Array.isArray(data) ? data[0] : null
  if (error || !row) {
    throw new StripeIntegrationError(
      'OAUTH_STATE_ERROR',
      `OAuth state was invalid, expired, or already consumed${error ? `: ${error.code}` : '.'}`,
      'invalid_state'
    )
  }
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    returnPath: sanitizePaymentReturnPath(row.return_path),
  }
}
