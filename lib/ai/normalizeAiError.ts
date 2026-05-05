// lib/ai/normalizeAiError.ts
// Converts raw HTTP errors from AI providers (Imagen, Gemini) into a
// consistent, structured error object used throughout the 360 module.
//
// Why this exists:
//   Each provider returns different error shapes and status codes. Without
//   normalization the generation service has to pattern-match strings spread
//   across many files. This centralizes all that logic in one place.
//
// SERVER-ONLY. Never import from client components.

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiErrorType =
  | 'quota_exceeded'          // HTTP 429
  | 'invalid_request'         // HTTP 400
  | 'auth_error'              // HTTP 401
  | 'billing_or_permission'   // HTTP 403
  | 'provider_unavailable'    // HTTP 5xx or network timeout
  | 'unknown'                 // anything else

export interface NormalizedAiError {
  type:        AiErrorType
  status:      number
  title:       string
  message:     string
  retryable:   boolean
  /** Seconds to wait before retrying (from provider Retry-After header). */
  retryAfter?: number
  raw?:        unknown
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Normalise an HTTP error from an AI provider into a consistent object.
 *
 * @param status  HTTP response status code (0 = network/timeout error)
 * @param body    Raw response body text
 * @param headers Optional response headers (for Retry-After)
 * @param raw     Optional raw object to attach for debugging
 */
export function normalizeAiError(
  status:   number,
  body?:    string | null,
  headers?: Record<string, string | null | undefined>,
  raw?:     unknown,
): NormalizedAiError {
  const text       = (body ?? '').toLowerCase()
  const retryAfter = parseRetryAfter(headers)

  // ── 429 Quota exceeded ────────────────────────────────────────────────────
  if (status === 429 || text.includes('quota') || text.includes('rate limit')) {
    return {
      type:       'quota_exceeded',
      status,
      title:      'Image generation quota reached',
      message:
        'Your image generation quota has been reached. ' +
        'Upgrade your Google Cloud billing plan, wait for the quota to reset, ' +
        'or reduce the number of frames per package.',
      retryable:  retryAfter !== undefined,
      retryAfter,
      raw,
    }
  }

  // ── 401 Bad API key ───────────────────────────────────────────────────────
  if (status === 401) {
    return {
      type:      'auth_error',
      status,
      title:     'Invalid API key',
      message:
        'The AI API key is missing or invalid. ' +
        'Add a valid GEMINI_API_KEY to your Vercel environment variables.',
      retryable: false,
      raw,
    }
  }

  // ── 403 Billing / permissions ─────────────────────────────────────────────
  if (status === 403) {
    return {
      type:      'billing_or_permission',
      status,
      title:     'API access denied',
      message:
        'The Imagen API is not enabled for your API key, or your billing account ' +
        'does not have access. Enable the Imagen API in Google Cloud Console.',
      retryable: false,
      raw,
    }
  }

  // ── 400 Bad request ───────────────────────────────────────────────────────
  if (status === 400) {
    const snippet = body?.slice(0, 300) ?? 'Request was rejected'
    return {
      type:      'invalid_request',
      status,
      title:     'Invalid generation request',
      message:   `The image generation API rejected the request (HTTP 400): ${snippet}`,
      retryable: false,
      raw,
    }
  }

  // ── 5xx Provider outage ───────────────────────────────────────────────────
  if (status >= 500 || status === 0) {
    return {
      type:      'provider_unavailable',
      status,
      title:     'AI provider unavailable',
      message:
        'The AI image generation service is temporarily unavailable. ' +
        'Please try again in a few minutes.',
      retryable: true,
      raw,
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    type:      'unknown',
    status,
    title:     'Generation error',
    message:   body?.slice(0, 300) ?? 'An unknown error occurred during image generation.',
    retryable: false,
    raw,
  }
}

/**
 * Quick helper: detect if a thrown Error represents a quota/429 problem
 * by inspecting its message string. Used when the full status code is
 * not available (e.g. when the provider already threw before returning HTTP status).
 */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('429') ||
    msg.toLowerCase().includes('quota exceeded') ||
    msg.toLowerCase().includes('quota_exceeded') ||
    msg.toLowerCase().includes('rate limit')
  )
}

/**
 * Quick helper: detect if a thrown Error represents a transient provider error
 * (5xx, timeout) that can be safely retried.
 */
export function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.toLowerCase().includes('timeout') ||
    msg.toLowerCase().includes('unavailable')
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRetryAfter(headers?: Record<string, string | null | undefined>): number | undefined {
  if (!headers) return undefined
  const raw = headers['retry-after'] ?? headers['Retry-After'] ?? headers['x-retry-after']
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) ? undefined : parsed
}
