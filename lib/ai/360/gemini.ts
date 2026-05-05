// lib/ai/360/gemini.ts
// Gemini image generation provider for the 360 Product Studio.
// Uses the Google AI REST API (generateContent with IMAGE modality).
//
// Required env vars:
//   GEMINI_API_KEY         — Google AI API key (same key used for website AI)
//   GEMINI_360_MODEL       — model override (default: gemini-2.5-flash-lite)
//
// SERVER-ONLY. Never import from client components.

import type { P360ImageProvider, P360GenerateFrameParams, P360GenerateFrameResult } from './types'

const API_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const TIMEOUT_MS  = 120_000

function getModel(): string {
  return (process.env.GEMINI_360_MODEL ?? DEFAULT_MODEL).trim()
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) throw new Error('GEMINI_API_KEY is not set. Configure it in your environment variables.')
  return key
}

interface GeminiInlineData {
  mimeType: string
  data:     string  // base64
}

interface GeminiPart {
  text?:       string
  inlineData?: GeminiInlineData
}

interface GeminiContent { parts: GeminiPart[] }

interface GeminiCandidate {
  content?: GeminiContent
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  error?: { code: number; message: string; status: string }
}

function extractImageFromResponse(json: GeminiResponse): { b64: string; mimeType: string } {
  if (json.error) {
    throw new Error(`Gemini API error ${json.error.code} (${json.error.status}): ${json.error.message}`)
  }

  const candidates = json.candidates ?? []
  if (!candidates.length) {
    throw new Error('Gemini returned no candidates. The model may not support image generation — try a different GEMINI_360_MODEL.')
  }

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? []
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          b64:      part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? 'image/png',
        }
      }
    }
  }

  // Try Imagen-style prediction response shape as fallback
  // (some Gemini endpoints return via the predict path)
  const anyJson = json as Record<string, unknown>
  const predictions = anyJson.predictions as Array<Record<string, unknown>> | undefined
  if (Array.isArray(predictions) && predictions.length > 0) {
    const first = predictions[0]
    const b64 = (first?.bytesBase64Encoded ?? first?.imageBytes) as string | undefined
    const mimeType = ((first?.mimeType ?? first?.imageType) as string | undefined) ?? 'image/png'
    if (b64) return { b64, mimeType }
  }

  const finishReason = candidates[0]?.finishReason
  throw new Error(
    `Gemini returned no image data (finishReason: ${finishReason ?? 'unknown'}). ` +
    `Ensure the configured model (${getModel()}) supports image generation. ` +
    `Try gemini-2.0-flash-exp or set GEMINI_360_MODEL to an image-capable model.`,
  )
}

async function callGeminiGenerateContent(
  model:          string,
  prompt:         string,
  width:          number,
  height:         number,
  signal:         AbortSignal,
): Promise<{ b64: string; mimeType: string }> {
  const apiKey = getApiKey()

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      // Gemini image generation config (supported on image-capable models)
      ...(width  ? { imageWidth:  width  } : {}),
      ...(height ? { imageHeight: height } : {}),
    },
  }

  const res = await fetch(
    `${API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(requestBody),
      signal,
    },
  )

  if (!res.ok) {
    let errText = ''
    try { errText = await res.text() } catch { /* ignore */ }
    throw new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 600)}`)
  }

  const json = (await res.json()) as GeminiResponse
  return extractImageFromResponse(json)
}

export const geminiProvider: P360ImageProvider = {
  name:  'gemini',
  model: getModel(),

  isAvailable() {
    return !!process.env.GEMINI_API_KEY?.trim()
  },

  async generateFrame(params: P360GenerateFrameParams): Promise<P360GenerateFrameResult> {
    const model     = getModel()
    const w         = params.width  ?? 1024
    const h         = params.height ?? 1024
    const timeoutMs = params.timeoutMs ?? TIMEOUT_MS

    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const { b64, mimeType } = await callGeminiGenerateContent(
        model,
        params.prompt,
        w, h,
        controller.signal,
      )

      const imageBuffer = Buffer.from(b64, 'base64')
      return { imageBuffer, mimeType, provider: 'gemini', model }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Gemini image generation timed out after ${timeoutMs / 1000}s.`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  },
}
