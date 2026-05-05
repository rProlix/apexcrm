// lib/ai/360/imagenProvider.ts
// P360ImageProvider implementation backed by Google Imagen.
//
// This replaces the previous Gemini generateContent-based approach which
// caused HTTP 400 "This model only supports text output" because
// gemini-2.5-flash-lite is a text-only model and cannot generate images.
//
// The correct architecture:
//   Text planning  → gemini-2.5-flash-lite (via lib/ai/geminiText.ts)
//   Image generation → imagen-4.0-ultra-generate-001 (this file)
//
// SERVER-ONLY. Never import from client components.

import type { P360ImageProvider, P360GenerateFrameParams, P360GenerateFrameResult } from './types'
import { generateWithImagen, deriveAspectRatio } from '@/lib/ai/imagenGenerate'

const DEFAULT_MODEL = 'imagen-4.0-ultra-generate-001'

// Imagen 4 removed negativePrompt support.
// generateWithImagen() merges these into the positive prompt automatically.
// Kept here only as documentation of what we want to avoid.
const AVOID_HINTS = [
  'text', 'watermarks', 'logos', 'blurry', 'distorted',
  'extra hands', 'extra people', 'extra objects', 'low quality',
  'overexposed', 'underexposed',
].join(', ')

function getModel(): string {
  return (process.env.P360_IMAGEN_MODEL ?? DEFAULT_MODEL).trim()
}

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
    const model      = getModel()
    const aspectRatio = deriveAspectRatio(params.width, params.height)

    // negativePrompt is merged into the positive prompt by generateWithImagen().
    // Imagen 4 does not accept negativePrompt as a separate field.
    const result = await generateWithImagen({
      prompt:          params.prompt,
      negativePrompt:  params.negativePrompt ?? AVOID_HINTS,
      aspectRatio,
      numberOfImages:  1,
      model,
      timeoutMs:       params.timeoutMs,
    })

    if (result.error || !result.images.length) {
      // Translate Imagen errors into user-friendly messages
      let msg = result.error ?? 'Imagen returned no images'
      if (msg.includes('text output') || msg.includes('text only')) {
        msg = `The selected model (${model}) only supports text output. ` +
              `Image generation requires an Imagen model such as imagen-4.0-ultra-generate-001. ` +
              `Set P360_IMAGEN_MODEL=imagen-4.0-ultra-generate-001 in your environment variables.`
      }
      throw new Error(msg)
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
