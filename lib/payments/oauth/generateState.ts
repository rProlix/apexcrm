// lib/payments/oauth/generateState.ts
import { createHmac, randomBytes } from 'crypto'

const STATE_SECRET = process.env.OAUTH_STATE_SECRET ?? 'fallback-dev-secret-change-in-prod'

export interface StatePayload {
  tenantId:  string
  provider:  string
  nonce:     string
  createdAt: number
}

/**
 * Generates a cryptographically signed OAuth state token.
 *
 * Format: base64url(payload) + '.' + hmac_signature
 *
 * Encodes tenantId + provider + nonce so we can recover them on callback
 * without a database round-trip. The HMAC prevents tampering.
 */
export function generateState(tenantId: string, provider: string): string {
  const payload: StatePayload = {
    tenantId,
    provider,
    nonce:     randomBytes(16).toString('hex'),
    createdAt: Date.now(),
  }

  const encoded  = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig      = createHmac('sha256', STATE_SECRET).update(encoded).digest('hex')

  return `${encoded}.${sig}`
}

/**
 * Parses a state token without verifying it.
 * Use verifyState() to validate before trusting the payload.
 */
export function parseState(state: string): StatePayload | null {
  try {
    const [encoded] = state.split('.')
    if (!encoded) return null
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as StatePayload
  } catch {
    return null
  }
}
