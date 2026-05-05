// lib/product-360/providers/imagineMidjourney.ts
// DEPRECATED — Midjourney/ImagineAPI has been replaced by Gemini.
// This file is kept as a stub so any lingering imports don't break the build.
// All generation now goes through lib/ai/360/gemini.ts via lib/ai/360/provider.ts.

import type { P360Provider } from './types'

/** @deprecated Use getP360Provider() from lib/ai/360/provider.ts instead. */
export const imagineMidjourneyProvider: P360Provider = {
  name: 'imagine_midjourney',
  isAvailable: () => false,
  async generate() {
    throw new Error(
      'ImagineAPI / Midjourney provider has been removed. ' +
      'Configure GEMINI_API_KEY and use the Gemini provider instead.',
    )
  },
}

/** @deprecated Use getP360Provider() from lib/ai/360/provider.ts instead. */
export function getConfiguredProvider(): null {
  return null
}
