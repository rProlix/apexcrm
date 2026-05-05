// lib/ai/imagenGenerate.ts
// Google Imagen image generation via the `:predict` REST endpoint.
//
// ⚠️  negativePrompt is NOT sent to the API.
//     Imagen 4 removed negativePrompt support (HTTP 400 INVALID_ARGUMENT).
//     Any negativePrompt passed to generateWithImagen() is merged into the
//     positive prompt via mergeNegativePromptIntoPrompt() before the request.
//
// This is the ONLY module that should call the Imagen image-generation API.
// Text-only Gemini models (gemini-2.5-flash-lite, gemini-3-flash-preview)
// cannot generate images and must not be used here.
//
// Required env vars:
//   GEMINI_API_KEY   — preferred
//   GOOGLE_API_KEY   — fallback
//
// SERVER-ONLY. Never import from client components.

import {
  mergeNegativePromptIntoPrompt,
  stripUnsupportedImagenFields,
  type ImagenRequestPayload,
} from './promptSafety'
import { assertNoUnsupportedImagenFields } from './assertNoUnsupportedImagenFields'

const IMAGEN_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL   = 'imagen-4.0-ultra-generate-001'
const DEFAULT_TIMEOUT = 120_000

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ImagenGenerateOptions {
  /** The image description prompt */
  prompt:          string
  /**
   * Optional constraints to avoid — merged into the positive prompt.
   * NOT sent to Imagen as a separate field (Imagen removed negativePrompt support).
   */
  negativePrompt?: string
  /**
   * Aspect ratio. Imagen 4 accepts: "1:1" | "9:16" | "16:9" | "4:3" | "3:4"
   * Default: "1:1" (square — used for 360 product frames)
   */
  aspectRatio?:    '1:1' | '9:16' | '16:9' | '4:3' | '3:4'
  /** Number of images (1–4 depending on model tier). Default: 1 */
  numberOfImages?: number
  /** Override default model. Default: imagen-4.0-ultra-generate-001 */
  model?:          string
  timeoutMs?:      number
}

export interface ImagenImage {
  /** Raw base64-encoded image bytes */
  base64:   string
  mimeType: string
}

export interface ImagenGenerateResult {
  images:  ImagenImage[]
  error?:  string
  model:   string
}

// ─── Imagen response shape ────────────────────────────────────────────────────

interface ImagenPrediction {
  bytesBase64Encoded?:   string
  bytes_base64_encoded?: string
  imageBytes?:           string
  image_bytes?:          string
  mimeType?:             string
  mime_type?:            string
}

interface ImagenResponse {
  predictions?: ImagenPrediction[]
  error?:       { code: number; message: string; status?: string }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate one or more images with Google Imagen via the `:predict` endpoint.
 *
 * - Always uses `:predict`, NEVER `:generateContent`.
 * - negativePrompt is merged into prompt text — NOT sent as a separate field.
 * - Never logs API keys.
 * - Returns { images: [], error } on failure — does not throw.
 */
export async function generateWithImagen(
  opts: ImagenGenerateOptions,
): Promise<ImagenGenerateResult> {
  const apiKey = getApiKey()
  const model  = opts.model ?? DEFAULT_MODEL

  if (!apiKey) {
    return {
      images: [],
      error:  'Missing GEMINI_API_KEY or GOOGLE_API_KEY. ' +
              'Add it to Vercel Production and Preview environment variables.',
      model,
    }
  }

  // Merge negativePrompt INTO the positive prompt — Imagen 4 no longer accepts
  // negativePrompt as a separate parameters field (HTTP 400 INVALID_ARGUMENT).
  const finalPrompt = mergeNegativePromptIntoPrompt(opts.prompt, opts.negativePrompt)
  if (opts.negativePrompt) {
    console.info('[imagenGenerate] Folded negativePrompt into positive prompt (Imagen 4 does not support negativePrompt).')
  }

  const payload: ImagenRequestPayload = {
    instances: [{ prompt: finalPrompt }],
    parameters: {
      sampleCount:      opts.numberOfImages ?? 1,
      aspectRatio:      opts.aspectRatio    ?? '1:1',
      personGeneration: 'dont_allow',
    },
  }

  // Defensive sanitizer — removes negativePrompt/negative_prompt if present
  const sanitizedBody = stripUnsupportedImagenFields(payload) as ImagenRequestPayload

  // Runtime regression guard — throws if any banned key slipped through
  assertNoUnsupportedImagenFields(sanitizedBody)

  console.info(
    `[imagenGenerate] model=${model} aspectRatio=${sanitizedBody.parameters?.aspectRatio} ` +
    `promptLen=${finalPrompt.length} payloadKeys=${Object.keys(sanitizedBody.parameters ?? {}).join(',')}`,
  )

  const controller = new AbortController()
  const timeoutMs  = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(
      `${IMAGEN_API_BASE}/${model}:predict?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sanitizedBody),
        signal:  controller.signal,
      },
    )
  } catch (err: unknown) {
    clearTimeout(timer)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      images: [],
      error:  isAbort
        ? `Imagen timed out after ${timeoutMs / 1000}s. Try again or reduce frame count.`
        : `Imagen request failed: ${err instanceof Error ? err.message : String(err)}`,
      model,
    }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch { /* ignore */ }

    let friendlyMsg = `Imagen API HTTP ${response.status} [model: ${model}]: ${errText.slice(0, 300)}`
    if (response.status === 400 && errText.includes('negativePrompt')) {
      friendlyMsg =
        `Imagen rejected negativePrompt field [model: ${model}]. ` +
        `This field is no longer supported. Check that imagenGenerate.ts merges ` +
        `negativePrompt into the prompt via mergeNegativePromptIntoPrompt().`
    } else if (response.status === 400 && errText.includes('text output')) {
      friendlyMsg =
        `The configured model (${model}) only supports text output. ` +
        `Image generation requires an Imagen model such as imagen-4.0-ultra-generate-001.`
    } else if (response.status === 400 && errText.includes('INVALID_ARGUMENT')) {
      friendlyMsg = `Imagen API rejected the request (INVALID_ARGUMENT) [model: ${model}]: ${errText.slice(0, 300)}`
    } else if (response.status === 403) {
      friendlyMsg =
        `Imagen API access denied. Check that GEMINI_API_KEY has the Imagen API ` +
        `enabled in Google Cloud Console.`
    }

    console.error(`[imagenGenerate] ${friendlyMsg}`)
    return { images: [], error: friendlyMsg, model }
  }

  let json: ImagenResponse
  try {
    json = await response.json() as ImagenResponse
  } catch {
    return { images: [], error: 'Imagen returned unreadable response.', model }
  }

  if (json.error) {
    const msg = `Imagen API error ${json.error.code} (${json.error.status ?? ''}): ${json.error.message}`
    console.error(`[imagenGenerate] API-level error: ${msg}`)
    return { images: [], error: msg, model }
  }

  const predictions = json.predictions ?? []
  if (!predictions.length) {
    return {
      images: [],
      error:  `Imagen returned no predictions (model: ${model}). ` +
              `The model may not be available or the prompt may have been blocked.`,
      model,
    }
  }

  const images: ImagenImage[] = []
  for (const pred of predictions) {
    const b64 = (
      pred.bytesBase64Encoded
      ?? pred.bytes_base64_encoded
      ?? pred.imageBytes
      ?? pred.image_bytes
    )
    if (!b64) continue
    images.push({
      base64:   b64,
      mimeType: (pred.mimeType ?? pred.mime_type ?? 'image/png') as string,
    })
  }

  if (!images.length) {
    return {
      images: [],
      error:  `Imagen returned predictions but no image bytes. ` +
              `Prediction keys: ${Object.keys(predictions[0] ?? {}).join(', ')}`,
      model,
    }
  }

  console.info(`[imagenGenerate] success: ${images.length} image(s), mimeType=${images[0].mimeType}`)
  return { images, model }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim()
  )
}

/**
 * Derive the closest Imagen aspect ratio from pixel dimensions.
 */
export function deriveAspectRatio(
  width:  number | null | undefined,
  height: number | null | undefined,
): '1:1' | '9:16' | '16:9' | '4:3' | '3:4' {
  if (!width || !height) return '1:1'
  const ratio = width / height
  if (ratio > 1.6) return '16:9'
  if (ratio > 1.2) return '4:3'
  if (ratio < 0.65) return '9:16'
  if (ratio < 0.85) return '3:4'
  return '1:1'
}
