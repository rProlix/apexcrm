// lib/payments/oauth/verifyState.ts
import { createHmac, timingSafeEqual } from 'crypto'
import { parseState, type StatePayload } from './generateState'

const STATE_SECRET  = process.env.OAUTH_STATE_SECRET ?? 'fallback-dev-secret-change-in-prod'
const MAX_AGE_MS    = 10 * 60 * 1000 // 10 minutes

export interface VerifyResult {
  valid:    boolean
  payload?: StatePayload
  error?:   string
}

/**
 * Verifies an OAuth state token:
 *   1. Validates the HMAC signature (prevents CSRF / tampering)
 *   2. Checks the token age (10-minute max)
 *   3. Returns the embedded payload on success
 */
export function verifyState(state: string): VerifyResult {
  if (!state || !state.includes('.')) {
    return { valid: false, error: 'Malformed state token' }
  }

  const dotIdx  = state.lastIndexOf('.')
  const encoded = state.slice(0, dotIdx)
  const sig     = state.slice(dotIdx + 1)

  if (!encoded || !sig) {
    return { valid: false, error: 'Malformed state token' }
  }

  const expected = createHmac('sha256', STATE_SECRET).update(encoded).digest('hex')

  let sigMatch: boolean
  try {
    sigMatch = timingSafeEqual(
      Buffer.from(sig,      'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return { valid: false, error: 'Invalid signature encoding' }
  }

  if (!sigMatch) {
    return { valid: false, error: 'State signature mismatch — possible CSRF attempt' }
  }

  const payload = parseState(state)
  if (!payload) {
    return { valid: false, error: 'Failed to decode state payload' }
  }

  if (Date.now() - payload.createdAt > MAX_AGE_MS) {
    return { valid: false, error: 'OAuth state token has expired' }
  }

  return { valid: true, payload }
}
