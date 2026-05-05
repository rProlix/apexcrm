// lib/ai/360/provider.ts
// Provider factory for the 360 Product Studio AI generation layer.
//
// Architecture:
//   Text planning  → lib/ai/geminiText.ts (gemini-2.5-flash-lite)
//   Image generation → imagenProvider (imagen-4.0-ultra-generate-001)  ← DEFAULT
//
// The previous default was the Gemini generateContent provider which caused
// HTTP 400 "This model only supports text output" because gemini-2.5-flash-lite
// is a text-only model. Imagen is now the default and only image provider.
//
// Override via env: PRODUCT_360_AI_PROVIDER=imagen (or 'gemini' for legacy testing)
//
// SERVER-ONLY.

import type { P360ImageProvider } from './types'
import { imagenProvider }         from './imagenProvider'
import { geminiProvider }         from './gemini'

type ProviderName = 'imagen' | 'gemini'

const PROVIDERS: Record<ProviderName, () => P360ImageProvider> = {
  imagen: () => imagenProvider,
  // 'gemini' kept for testing only — will fail on text-only models
  gemini: () => geminiProvider,
}

function getProviderName(): ProviderName {
  const raw = process.env.PRODUCT_360_AI_PROVIDER?.trim().toLowerCase()
  if (raw === 'gemini') return 'gemini'
  return 'imagen'
}

/**
 * Returns the active configured provider, or null if unavailable.
 */
export function getP360Provider(): P360ImageProvider | null {
  try {
    const name     = getProviderName()
    const factory  = PROVIDERS[name]
    const provider = factory ? factory() : imagenProvider

    if (!provider.isAvailable()) {
      console.warn(
        `[p360:provider] Provider "${provider.name}" is not available. ` +
        `Ensure GEMINI_API_KEY (or GOOGLE_API_KEY) is set in your environment variables.`,
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
      'Set GEMINI_API_KEY or GOOGLE_API_KEY in your Vercel environment variables ' +
      'to enable Imagen image generation.',
    )
  }
  return p
}

export type { P360ImageProvider }
