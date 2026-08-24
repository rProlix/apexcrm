export type StripeErrorCategory =
  | 'CONFIGURATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'OAUTH_STATE_ERROR'
  | 'OAUTH_EXCHANGE_ERROR'
  | 'ACCOUNT_CONFLICT'
  | 'ACCOUNT_RESTRICTED'
  | 'WEBHOOK_SIGNATURE_ERROR'
  | 'WEBHOOK_MAPPING_ERROR'
  | 'PAYMENT_ERROR'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT'
  | 'UNKNOWN_PROVIDER_ERROR'

export class StripeIntegrationError extends Error {
  constructor(
    public readonly category: StripeErrorCategory,
    message: string,
    public readonly safeCode: string,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'StripeIntegrationError'
  }
}

export function stripeTenantMessage(code: string): string {
  const messages: Record<string, string> = {
    configuration_unavailable: 'Stripe connection is temporarily unavailable.',
    invalid_state: 'This Stripe connection request is invalid or has expired. Please try again.',
    authorization_required: 'Sign in again before connecting Stripe.',
    access_denied: 'Stripe connection was canceled.',
    account_conflict: 'That Stripe account is already connected to another workspace.',
    mode_mismatch: 'The Stripe account mode does not match this Nexora environment.',
    exchange_failed: 'Stripe could not be connected. Please try again.',
    persistence_failed: 'Stripe connected, but Nexora could not save the connection safely.',
  }
  return messages[code] ?? 'Stripe could not be connected. Please try again.'
}
