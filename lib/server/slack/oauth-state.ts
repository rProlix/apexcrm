import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { getTokenEncryptionKey } from '@/lib/server/crypto/encrypt-token'

export type SlackOAuthState = {
  tenantId: string
  businessId: string
  userId: string
  nonce: string
  issuedAt: number
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000

function stateKey(): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    getTokenEncryptionKey(),
    Buffer.alloc(0),
    Buffer.from('nexoranow/slack-oauth-state/v1'),
    32,
  ))
}

export function createSlackOAuthState(input: Omit<SlackOAuthState, 'nonce' | 'issuedAt'>) {
  const payload: SlackOAuthState = {
    ...input,
    nonce: randomBytes(24).toString('base64url'),
    issuedAt: Date.now(),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', stateKey()).update(encoded).digest('base64url')
  return { state: `${encoded}.${signature}`, payload }
}

export function verifySlackOAuthState(value: string, expectedNonce?: string): SlackOAuthState {
  const [encoded, suppliedSignature, extra] = value.split('.')
  if (!encoded || !suppliedSignature || extra) throw new Error('Malformed Slack OAuth state')

  const expectedSignature = createHmac('sha256', stateKey()).update(encoded).digest()
  const supplied = Buffer.from(suppliedSignature, 'base64url')
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
    throw new Error('Invalid Slack OAuth state signature')
  }

  let payload: SlackOAuthState
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SlackOAuthState
  } catch {
    throw new Error('Unreadable Slack OAuth state')
  }

  if (!payload.tenantId || payload.businessId !== payload.tenantId || !payload.userId || !payload.nonce) {
    throw new Error('Invalid Slack OAuth state payload')
  }
  if (!Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > STATE_MAX_AGE_MS || payload.issuedAt > Date.now() + 30_000) {
    throw new Error('Slack OAuth state expired')
  }
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error('Slack OAuth nonce mismatch')
  return payload
}
