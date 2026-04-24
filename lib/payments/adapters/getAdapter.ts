// lib/payments/adapters/getAdapter.ts
import type { PaymentAdapter, ProviderKey } from './paymentAdapter'
import { stripeAdapter  } from './stripeAdapter'
import { squareAdapter  } from './squareAdapter'

const adapters: Record<ProviderKey, PaymentAdapter> = {
  stripe: stripeAdapter,
  square: squareAdapter,
}

/**
 * Returns the payment adapter for the given provider key.
 * Throws if the provider is unknown.
 */
export function getAdapter(providerKey: ProviderKey | string): PaymentAdapter {
  const adapter = adapters[providerKey as ProviderKey]
  if (!adapter) {
    throw new Error(`[getAdapter] Unknown provider: "${providerKey}". Supported: stripe, square`)
  }
  return adapter
}

export { stripeAdapter, squareAdapter }
export type { PaymentAdapter, ProviderKey }
