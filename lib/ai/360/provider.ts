// lib/ai/360/provider.ts
// Provider factory for the 360 Product Studio AI generation layer.
// Resolves the configured provider and returns a ready-to-use instance.
//
// To swap providers, set PRODUCT_360_AI_PROVIDER=gemini (or 'imagen', 'mock').
// Default: 'gemini'
//
// SERVER-ONLY.

import type { P360ImageProvider } from './types'
import { geminiProvider }         from './gemini'

type ProviderName = 'gemini'

const PROVIDERS: Record<ProviderName, () => P360ImageProvider> = {
  gemini: () => geminiProvider,
}

function getProviderName(): ProviderName {
  const raw = process.env.PRODUCT_360_AI_PROVIDER?.trim().toLowerCase()
  if (raw && raw in PROVIDERS) return raw as ProviderName
  return 'gemini'
}

/**
 * Returns the active configured provider, or null if unavailable.
 * Logs a warning if the provider cannot be initialized.
 */
export function getP360Provider(): P360ImageProvider | null {
  try {
    const name     = getProviderName()
    const provider = PROVIDERS[name]?.()
    if (!provider) {
      console.warn(`[p360:provider] Unknown provider "${name}". Falling back to gemini.`)
      return PROVIDERS.gemini()
    }
    if (!provider.isAvailable()) {
      console.warn(
        `[p360:provider] Provider "${provider.name}" is not available. ` +
        `Ensure GEMINI_API_KEY is set.`,
      )
      return null
    }
    return provider
  } catch (err) {
    console.error('[p360:provider] Failed to initialize provider:', err)
    return null
  }
}

/**
 * Throws if no provider is available (use in generation pipeline).
 */
export function requireP360Provider(): P360ImageProvider {
  const p = getP360Provider()
  if (!p) {
    throw new Error(
      'No AI image generation provider is available. ' +
      'Set GEMINI_API_KEY in your environment variables to enable Gemini generation.',
    )
  }
  return p
}

export type { P360ImageProvider }
