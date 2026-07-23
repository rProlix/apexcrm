// lib/ai/geminiRequest.ts
// Centralised Gemini generateContent HTTP client for TEXT generation.
//
// Why this exists:
//   Several places in the codebase were passing responseMimeType: 'application/json'
//   in generationConfig. The Gemini API rejects this with HTTP 400 on models that
//   only allow 'text/plain'. This helper NEVER sends an unsupported responseMimeType,
//   preventing that class of error from recurring.
//
// Rules enforced here:
//   - NEVER sends responseMimeType: 'application/json' (causes HTTP 400 on many models)
//   - NEVER sends responseMimeType: 'image/png' or 'image/jpeg' via this helper
//     (image output is controlled by responseModalities in the caller, not here)
//   - Only emits responseMimeType: 'text/plain' when explicitly needed, otherwise omits it
//   - Reads GEMINI_API_KEY from process.env (server-side only)
//   - Logs model + feature name but NEVER logs API keys
//
// SERVER-ONLY. Never import from client components.

import { safeParseGeminiJson } from './parseGeminiJson'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_TIMEOUT_MS = 90_000

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeminiTextRequestOptions {
  /** Gemini model name, e.g. 'gemini-3-flash-preview' */
  model:             string
  /** Full prompt text */
  prompt:            string
  /**
   * Feature tag used in log lines — helps identify which feature caused an error.
   * e.g. 'website-autofill', 'image-planner', '360-studio'
   */
  feature?:          string
  temperature?:      number
  topK?:             number
  topP?:             number
  maxOutputTokens?:  number
  /**
   * When true, the raw text response is parsed as JSON using safeParseGeminiJson.
   * The helper always requests text/plain and parses manually — never uses
   * responseMimeType: 'application/json'.
   */
  expectJson?:       boolean
  timeoutMs?:        number
}

export interface GeminiTextResult<T = string> {
  /** Raw text content from the Gemini response */
  text:         string
  /** Parsed JSON value (only populated when expectJson: true) */
  data:         T | null
  /** JSON parse error (only populated when expectJson: true and parsing failed) */
  parseError?:  string
  /** Gemini token usage metadata */
  tokenUsage:   Record<string, unknown>
  /** HTTP / network / API-level error (request did not succeed) */
  error?:       string
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface GeminiPart      { text?: string; inlineData?: { mimeType: string; data: string } }
interface GeminiContent   { parts: GeminiPart[] }
interface GeminiCandidate { content?: GeminiContent }
interface GeminiApiResponse {
  candidates?:    GeminiCandidate[]
  usageMetadata?: Record<string, unknown>
  error?:         { code: number; message: string; status?: string }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call a Gemini text generation model and return the text response.
 *
 * - Always uses text/plain (or no responseMimeType) — never application/json.
 * - If expectJson is true, parses the text as JSON via safeParseGeminiJson.
 * - Never throws — returns { error } on failure.
 *
 * @example
 *   const { text, data, error } = await callGeminiText<MySchema>({
 *     model:      'gemini-3-flash-preview',
 *     prompt:     '...return JSON...',
 *     expectJson: true,
 *     feature:    'website-autofill',
 *   })
 */
export async function callGeminiText<T = string>(
  opts: GeminiTextRequestOptions,
): Promise<GeminiTextResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const feature = opts.feature ?? 'unknown'

  if (!apiKey) {
    return {
      text:       '',
      data:       null,
      tokenUsage: {},
      error:      `GEMINI_API_KEY is not set. Configure it in environment variables. [feature: ${feature}]`,
    }
  }

  const url = `${GEMINI_API_BASE}/${opts.model}:generateContent?key=${apiKey}`

  // Build generationConfig — deliberately OMIT responseMimeType unless
  // the model needs text/plain to be explicit (currently: never needed by any model we use).
  // Sending 'application/json' here is what caused the HTTP 400 error.
  const generationConfig: Record<string, unknown> = {}
  if (opts.temperature      !== undefined) generationConfig.temperature      = opts.temperature
  if (opts.topK             !== undefined) generationConfig.topK             = opts.topK
  if (opts.topP             !== undefined) generationConfig.topP             = opts.topP
  if (opts.maxOutputTokens  !== undefined) generationConfig.maxOutputTokens  = opts.maxOutputTokens

  const body = {
    contents:         [{ parts: [{ text: opts.prompt }] }],
    generationConfig: Object.keys(generationConfig).length ? generationConfig : undefined,
  }

  console.info(`[geminiRequest] ${feature} → ${opts.model} (expectJson=${!!opts.expectJson})`)

  const controller = new AbortController()
  const timeoutMs  = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      text:       '',
      data:       null,
      tokenUsage: {},
      error:      isAbort
        ? `AI analysis timed out after ${timeoutMs / 1000}s. Try again.`
        : 'AI analysis is temporarily unavailable. Try again.',
    }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch { /* ignore */ }
    const snippet = errText.slice(0, 300)
    console.error(`[geminiRequest] HTTP ${response.status} [feature: ${feature}, model: ${opts.model}]:`, snippet)
    return {
      text:       errText,
      data:       null,
      tokenUsage: {},
      error:      `AI analysis request failed (${response.status}). Try again.`,
    }
  }

  let json: GeminiApiResponse
  try {
    json = await response.json() as GeminiApiResponse
  } catch {
    return {
      text:       '',
      data:       null,
      tokenUsage: {},
      error:      'AI analysis returned an unreadable response. Try again.',
    }
  }

  // Handle API-level error inside a 200 body
  if (json.error) {
    const msg = `Gemini API error ${json.error.code} (${json.error.status ?? ''}): ${json.error.message} [feature: ${feature}]`
    console.error(`[geminiRequest] API-level error:`, msg)
    return { text: '', data: null, tokenUsage: {}, error: 'AI analysis is temporarily unavailable. Try again.' }
  }

  const tokenUsage = json.usageMetadata ?? {}
  const text       = extractTextFromCandidates(json.candidates)

  if (!text) {
    return {
      text:       '',
      data:       null,
      tokenUsage,
      error:      'AI analysis returned no content. Try again.',
    }
  }

  // If JSON is expected, parse the text
  if (opts.expectJson) {
    const { data, error: parseError } = safeParseGeminiJson<T>(text)
    return { text, data, parseError: parseError ?? undefined, tokenUsage }
  }

  return { text, data: null, tokenUsage }
}

// ─── Multimodal support ───────────────────────────────────────────────────────

export interface GeminiMultimodalPart {
  text?:       string
  inlineData?: { mimeType: string; data: string }
}

/**
 * Call a Gemini model with multimodal input (image + text).
 * Used for vision tasks such as analyzing the master 360° frame.
 *
 * Never throws — returns { error } on failure.
 */
export async function callGeminiMultimodal(opts: {
  model:        string
  parts:        GeminiMultimodalPart[]
  temperature?: number
  feature?:     string
  timeoutMs?:   number
}): Promise<GeminiTextResult<string>> {
  const apiKey  = process.env.GEMINI_API_KEY?.trim()
  const feature = opts.feature ?? 'multimodal'

  if (!apiKey) {
    return { text: '', data: null, tokenUsage: {},
      error: `GEMINI_API_KEY is not set [feature: ${feature}]` }
  }

  const url = `${GEMINI_API_BASE}/${opts.model}:generateContent?key=${apiKey}`

  const generationConfig: Record<string, unknown> = {}
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature

  const body = {
    contents: [{ parts: opts.parts }],
    generationConfig: Object.keys(generationConfig).length ? generationConfig : undefined,
  }

  console.info(`[geminiRequest] ${feature} → ${opts.model} (multimodal, parts=${opts.parts.length})`)

  const controller = new AbortController()
  const timeoutMs  = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return { text: '', data: null, tokenUsage: {},
      error: isAbort
        ? `AI analysis timed out after ${timeoutMs / 1000}s. Try again.`
        : 'AI analysis is temporarily unavailable. Try again.' }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch { /* ignore */ }
    return { text: errText, data: null, tokenUsage: {},
      error: `AI analysis request failed (${response.status}). Try again.` }
  }

  let json: GeminiApiResponse
  try { json = await response.json() as GeminiApiResponse } catch {
    return { text: '', data: null, tokenUsage: {},
      error: 'AI analysis returned an unreadable response. Try again.' }
  }

  if (json.error) {
    return { text: '', data: null, tokenUsage: {},
      error: 'AI analysis is temporarily unavailable. Try again.' }
  }

  const text = extractTextFromCandidates(json.candidates)
  return { text, data: text || null, tokenUsage: json.usageMetadata ?? {} }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractTextFromCandidates(
  candidates?: GeminiCandidate[],
): string {
  if (!candidates?.length) return ''
  const first = candidates[0]
  const parts = first?.content?.parts ?? []
  return parts
    .map(p => p.text ?? '')
    .join('')
}
