// lib/product-360/providers/geminiProvider.ts
//
// Wraps the existing Imagen / Gemini image generation stack (lib/ai/360/imagenProvider.ts)
// into the clean Product360Provider interface.
//
// No generation logic lives here — this is a thin adapter.
// SERVER-ONLY. Never import from client components.

import { getP360Provider }    from '@/lib/ai/360/provider'
import type {
  Product360Provider,
  Generate360FrameInput,
  Generate360FrameResult,
  ProviderError,
} from './types'

function normalizeError(err: unknown): ProviderError {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource exhausted')) {
    return { code: 'quota_exceeded', message: msg, isRetryable: true,  isQuotaError: true }
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('api key') || lower.includes('unauthorized')) {
    return { code: 'auth_failed',    message: msg, isRetryable: false, isQuotaError: false }
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return { code: 'timeout',        message: msg, isRetryable: true,  isQuotaError: false }
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return { code: 'network',        message: msg, isRetryable: true,  isQuotaError: false }
  }
  return { code: 'unknown', message: msg, isRetryable: true, isQuotaError: false }
}

export class GeminiProduct360Provider implements Product360Provider {
  readonly name = 'gemini' as const

  isAvailable(): boolean {
    const inner = getP360Provider()
    return inner !== null && inner.isAvailable()
  }

  configErrors(): string[] {
    const errors: string[] = []
    const hasGemini  = !!(process.env.GEMINI_API_KEY?.trim())
    const hasGoogle  = !!(process.env.GOOGLE_API_KEY?.trim())
    if (!hasGemini && !hasGoogle) {
      errors.push('Missing GEMINI_API_KEY (or GOOGLE_API_KEY) for Gemini/Imagen provider')
    }
    return errors
  }

  async generateFrame(input: Generate360FrameInput): Promise<Generate360FrameResult> {
    const inner = getP360Provider()
    if (!inner || !inner.isAvailable()) {
      return {
        status:   'failed',
        mimeType: 'image/png',
        provider: 'gemini',
        error: {
          code:         'provider_not_configured',
          message:      'Gemini/Imagen provider is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.',
          isRetryable:  false,
          isQuotaError: false,
        },
      }
    }

    try {
      const result = await inner.generateFrame({
        prompt:                  input.prompt,
        width:                   input.width,
        height:                  input.height,
        referenceImageBase64:    input.referenceImageBase64,
        referenceImageMimeType:  input.referenceImageMimeType,
      })

      return {
        status:      'completed',
        imageBuffer: result.imageBuffer,
        imageUrl:    result.imageUrl,
        mimeType:    result.mimeType ?? 'image/png',
        provider:    'gemini',
        model:       result.model,
      }
    } catch (err) {
      return {
        status:   'failed',
        mimeType: 'image/png',
        provider: 'gemini',
        error:    normalizeError(err),
      }
    }
  }
}

/** Singleton */
let _instance: GeminiProduct360Provider | null = null
export function getGeminiProvider(): GeminiProduct360Provider {
  if (!_instance) _instance = new GeminiProduct360Provider()
  return _instance
}
