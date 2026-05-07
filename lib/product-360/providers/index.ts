// lib/product-360/providers/index.ts
//
// Factory: resolves the correct Product360Provider for a given provider name.
// SERVER-ONLY. Never import from client components.

export type { Product360ProviderName, Product360Provider, ProviderError } from './types'
export { getGeminiProvider }    from './geminiProvider'
export { getLeonardoProvider }  from './leonardoProvider'

import type { Product360Provider, Product360ProviderName } from './types'
import { getGeminiProvider }   from './geminiProvider'
import { getLeonardoProvider } from './leonardoProvider'

/**
 * Returns the provider instance for the given provider name.
 * Throws if the provider name is unknown.
 */
export function getProduct360Provider(providerName: string): Product360Provider {
  const name = (providerName?.toLowerCase() ?? 'gemini') as Product360ProviderName
  switch (name) {
    case 'leonardo': return getLeonardoProvider()
    case 'gemini':
    default:         return getGeminiProvider()
  }
}

/**
 * Returns the provider instance and throws a descriptive error if
 * the provider is not configured (missing env vars, etc.).
 */
export function requireProduct360Provider(providerName: string): Product360Provider {
  const provider = getProduct360Provider(providerName)
  if (!provider.isAvailable()) {
    const errs = provider.configErrors()
    throw new Error(
      `360 Product Studio: provider "${providerName}" is not configured.\n` +
      errs.join('\n'),
    )
  }
  return provider
}
