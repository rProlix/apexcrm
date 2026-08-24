import { createHash, randomBytes } from 'crypto'

export const STRIPE_PAYMENTS_PATH = '/payments/providers'

export function createOpaqueOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function sanitizePaymentReturnPath(value: string | null): string {
  return value === STRIPE_PAYMENTS_PATH ? value : STRIPE_PAYMENTS_PATH
}

export function stripeKeyMatchesMode(secretKey: string, livemode: boolean): boolean {
  return livemode ? secretKey.startsWith('sk_live_') : secretKey.startsWith('sk_test_')
}
