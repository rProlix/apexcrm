// lib/ai/360/imagenProvider.ts
// P360ImageProvider implementation backed by Google Imagen.
//
// Text planning  → gemini-2.5-flash-lite (via lib/ai/geminiText.ts)
// Image generation → imagen-4.0-ultra-generate-001 (this file)
//
// SERVER-ONLY. Never import from client components.

import type { P360ImageProvider, P360GenerateFrameParams, P360GenerateFrameResult } from './types'
import { generateWithImagen, deriveAspectRatio } from '@/lib/ai/imagenGenerate'

const DEFAULT_MODEL = 'imagen-4.0-ultra-generate-001'

// Imagen 4 removed negativePrompt support.
// generateWithImagen() merges these into the positive prompt automatically.
const AVOID_HINTS = [
  'text', 'watermarks', 'logos', 'blurry', 'distorted',
  'extra hands', 'extra people', 'extra objects', 'low quality',
  'overexposed', 'underexposed',
].join(', ')

function getModel(): string {
  return (process.env.P360_IMAGEN_MODEL ?? DEFAULT_MODEL).trim()
}

// ─── Typed error for quota/permission failures ─────────────────────────────

/**
 * Thrown by generateFrame() when the provider returns an HTTP error that
 * should be handled specially (e.g. 429 → pause the package).
 */
export class ImagenApiError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name       = 'ImagenApiError'
    this.statusCode = statusCode
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const imagenProvider: P360ImageProvider = {
  name:  'imagen',
  model: getModel(),

  isAvailable() {
    return !!(
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim()
    )
  },

  async generateFrame(params: P360GenerateFrameParams): Promise<P360GenerateFrameResult> {
    const model       = getModel()
    const aspectRatio = deriveAspectRatio(params.width, params.height)

    const result = await generateWithImagen({
      prompt:                  params.prompt,
      negativePrompt:          params.negativePrompt ?? AVOID_HINTS,
      aspectRatio,
      numberOfImages:          1,
      model,
      timeoutMs:               params.timeoutMs,
      referenceImageBase64:    params.referenceImageBase64,
      referenceImageMimeType:  params.referenceImageMimeType,
    })

    if (result.error || !result.images.length) {
      let msg = result.error ?? 'Imagen returned no images'
      if (msg.includes('text output') || msg.includes('text only')) {
        msg =
          `The selected model (${model}) only supports text output. ` +
          `Image generation requires an Imagen model such as imagen-4.0-ultra-generate-001. ` +
          `Set P360_IMAGEN_MODEL=imagen-4.0-ultra-generate-001 in your environment variables.`
      }
      // Throw a typed error that carries the HTTP status code so the caller can
      // distinguish quota errors (429) from fatal errors (400, 401, 403).
      throw new ImagenApiError(msg, result.statusCode ?? 0)
    }

    const img         = result.images[0]
    const imageBuffer = Buffer.from(img.base64, 'base64')

    return {
      imageBuffer,
      mimeType: img.mimeType,
      provider: 'imagen',
      model,
    }
  },
}
