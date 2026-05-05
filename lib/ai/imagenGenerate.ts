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
  /**
   * Optional base64-encoded reference image for image-conditioned generation.
   * Attached as the `image` field in the Imagen instance payload.
   * Useful for visual consistency in 360° sequences (pass the master frame here).
   * If the API rejects it (HTTP 400), the call is automatically retried without
   * the reference image so generation always proceeds.
   */
  referenceImageBase64?:   string
  referenceImageMimeType?: string
}

export interface ImagenImage {
  /** Raw base64-encoded image bytes */
  base64:   string
  mimeType: string
}

export interface ImagenGenerateResult {
  images:      ImagenImage[]
  error?:      string
  model:       string
  /** HTTP status code of the failed response (0 = network/timeout). Undefined on success. */
  statusCode?: number
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

interface DoImagenResult {
  ok:     boolean
  status: number
  text:   string
  json?:  ImagenResponse
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate one or more images with Google Imagen via the `:predict` endpoint.
 *
 * - Always uses `:predict`, NEVER `:generateContent`.
 * - negativePrompt is merged into prompt text — NOT sent as a separate field.
 * - If referenceImageBase64 is provided, it is attached to the instance.
 *   If the model rejects it (HTTP 400), the request is retried without it.
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

  const finalPrompt = mergeNegativePromptIntoPrompt(opts.prompt, opts.negativePrompt)
  if (opts.negativePrompt) {
    console.info('[imagenGenerate] Folded negativePrompt into positive prompt (Imagen 4 does not support negativePrompt).')
  }

  // Build instance — optionally attach a reference image
  const instance: Record<string, unknown> = { prompt: finalPrompt }
  if (opts.referenceImageBase64) {
    instance.image = {
      bytesBase64Encoded: opts.referenceImageBase64,
      mimeType:           opts.referenceImageMimeType ?? 'image/png',
    }
    console.info('[imagenGenerate] Attaching reference image for image-conditioned generation.')
  }

  const payload: ImagenRequestPayload = {
    instances: [instance as { prompt: string }],
    parameters: {
      sampleCount:      opts.numberOfImages ?? 1,
      aspectRatio:      opts.aspectRatio    ?? '1:1',
      personGeneration: 'dont_allow',
    },
  }

  const sanitizedBody = stripUnsupportedImagenFields(payload) as ImagenRequestPayload
  assertNoUnsupportedImagenFields(sanitizedBody)

  console.info(
    `[imagenGenerate] model=${model} aspectRatio=${sanitizedBody.parameters?.aspectRatio} ` +
    `promptLen=${finalPrompt.length} hasRef=${!!opts.referenceImageBase64}`,
  )

  const result = await doImagenFetch(apiKey, model, sanitizedBody, opts.timeoutMs ?? DEFAULT_TIMEOUT)

  // If the reference image caused a rejection, retry without it
  if (!result.ok && opts.referenceImageBase64 && result.status === 400) {
    console.warn('[imagenGenerate] Reference image caused HTTP 400 — retrying without reference image.')
    const fallbackPayload = stripUnsupportedImagenFields({
      instances:  [{ prompt: finalPrompt }],
      parameters: sanitizedBody.parameters,
    }) as ImagenRequestPayload
    assertNoUnsupportedImagenFields(fallbackPayload)
    const retry = await doImagenFetch(apiKey, model, fallbackPayload, opts.timeoutMs ?? DEFAULT_TIMEOUT)
    return parseImagenResponse(retry, model)
  }

  return parseImagenResponse(result, model)
}

// ─── Internal: HTTP fetch ─────────────────────────────────────────────────────

async function doImagenFetch(
  apiKey:    string,
  model:     string,
  body:      ImagenRequestPayload,
  timeoutMs: number,
): Promise<DoImagenResult> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(
      `${IMAGEN_API_BASE}/${model}:predict?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      },
    )
  } catch (err: unknown) {
    clearTimeout(timer)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      ok:     false,
      status: 0,
      text:   isAbort
        ? `Imagen timed out after ${timeoutMs / 1000}s. Try again or reduce frame count.`
        : `Imagen request failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }

  const text = response.ok ? '' : await response.text().catch(() => '')
  let json: ImagenResponse | undefined
  if (response.ok) {
    try { json = await response.json() as ImagenResponse } catch { /* handled in parseImagenResponse */ }
  }
  return { ok: response.ok, status: response.status, text, json }
}

// ─── Internal: parse response ─────────────────────────────────────────────────

function parseImagenResponse(result: DoImagenResult, model: string): ImagenGenerateResult {
  if (!result.ok) {
    const errText = result.text
    let friendlyMsg = result.status
      ? `Imagen API HTTP ${result.status} [model: ${model}]: ${errText.slice(0, 300)}`
      : errText  // timeout / network error

    if (result.status === 429) {
      friendlyMsg = `Imagen API HTTP 429 [model: ${model}]: ${errText.slice(0, 300)}`
    } else if (result.status === 400 && errText.includes('negativePrompt')) {
      friendlyMsg = `Imagen rejected negativePrompt field [model: ${model}]. Use mergeNegativePromptIntoPrompt().`
    } else if (result.status === 400 && errText.includes('text output')) {
      friendlyMsg = `Model (${model}) only supports text output. Image generation needs imagen-4.0-ultra-generate-001.`
    } else if (result.status === 400 && errText.includes('INVALID_ARGUMENT')) {
      friendlyMsg = `Imagen INVALID_ARGUMENT [model: ${model}]: ${errText.slice(0, 300)}`
    } else if (result.status === 403) {
      friendlyMsg = `Imagen API access denied. Check that GEMINI_API_KEY has the Imagen API enabled in Google Cloud Console.`
    }

    console.error(`[imagenGenerate] ${friendlyMsg}`)
    return { images: [], error: friendlyMsg, model, statusCode: result.status || undefined }
  }

  const json = result.json
  if (!json) return { images: [], error: 'Imagen returned unreadable response.', model }

  if (json.error) {
    const msg = `Imagen error ${json.error.code} (${json.error.status ?? ''}): ${json.error.message}`
    console.error(`[imagenGenerate] ${msg}`)
    return { images: [], error: msg, model }
  }

  const predictions = json.predictions ?? []
  if (!predictions.length) {
    return { images: [], error: `Imagen returned no predictions (model: ${model}).`, model }
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
    images.push({ base64: b64, mimeType: (pred.mimeType ?? pred.mime_type ?? 'image/png') as string })
  }

  if (!images.length) {
    return {
      images: [],
      error:  `Imagen returned predictions but no image bytes. Keys: ${Object.keys(predictions[0] ?? {}).join(', ')}`,
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
