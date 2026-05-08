// lib/product-360/pumpClient.ts
//
// Client-safe helper for calling POST /api/product-360/packages/{id}/pump.
//
// Separates network errors (fetch never reached server) from HTTP application
// errors (server responded but ok:false) so the UI can show the right message.
//
// CLIENT SAFE — no server-only imports, no process.env, no Buffer.

export type PumpCallKind = 'network' | 'http' | 'application' | 'ok'

export interface PumpCallResult {
  kind:       PumpCallKind
  ok:         boolean
  status?:    number
  message:    string
  data?:      Record<string, unknown>
  errorCode?: string
  errorDetails?: string | null
  failedStage?:  string | null
  retryAt?:      string | null
  /** For Leonardo polling: package is still processing, pump again */
  isProcessing?: boolean
  executionId?:  string | null
}

/**
 * Call the pump endpoint once for a single frame.
 *
 * Returns a typed `PumpCallResult` — never throws.
 *
 * Distinguishes:
 *  - `kind: 'network'`      → fetch never reached server (offline, DNS, CORS)
 *  - `kind: 'http'`         → server responded with a non-2xx HTTP status
 *  - `kind: 'application'`  → server returned 2xx but `ok: false` in JSON body
 *  - `kind: 'ok'`           → success, `data` contains the parsed response
 */
export async function callPump(
  packageId: string,
  tenantId:  string,
  signal?:   AbortSignal,
): Promise<PumpCallResult> {
  let res: Response
  let json: Record<string, unknown>

  // ── Network layer ─────────────────────────────────────────────────────────
  try {
    res = await fetch(`/api/product-360/packages/${encodeURIComponent(packageId)}/pump`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenantId }),
      // credentials: 'same-origin' is the default for same-origin requests
      // Explicitly set to support all browsers including mobile Safari
      credentials: 'same-origin',
      signal,
    })
  } catch (err) {
    const isAbort  = err instanceof DOMException && err.name === 'AbortError'
    const message  = isAbort
      ? 'Generation was cancelled.'
      : 'Network error — the request did not reach the server. Check your internet connection and try again.'

    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.debug('[pumpClient] fetch network error', {
        packageId,
        error:   err instanceof Error ? err.message : String(err),
        isAbort,
        online:  typeof navigator !== 'undefined' ? navigator.onLine : 'unknown',
      })
    }

    return { kind: 'network', ok: false, message, errorCode: isAbort ? 'aborted' : 'network_error' }
  }

  // ── HTTP layer ────────────────────────────────────────────────────────────
  try {
    json = await res.json() as Record<string, unknown>
  } catch {
    return {
      kind:    'http',
      ok:      false,
      status:  res.status,
      message: `Server error (HTTP ${res.status}) — response was not valid JSON.`,
      errorCode: 'invalid_response',
    }
  }

  if (!res.ok && !json.ok) {
    // Server returned 4xx/5xx and JSON body confirms the error
    return {
      kind:        'http',
      ok:          false,
      status:      res.status,
      message:     (json.errorMessage as string | undefined) ?? `Server error (HTTP ${res.status})`,
      errorCode:   (json.errorCode    as string | undefined) ?? `http_${res.status}`,
      errorDetails: (json.errorDetails as string | null | undefined) ?? null,
      failedStage:  (json.failedStage  as string | null | undefined) ?? null,
    }
  }

  // ── Application layer ─────────────────────────────────────────────────────
  if (!json.ok) {
    const errorCode    = (json.errorCode    as string | undefined) ?? 'application_error'
    const errorMessage = (json.errorMessage as string | undefined) ?? 'Generation failed'
    const retryAt      = (json.retryAt      as string | null | undefined) ?? null

    // Leonardo polling: provider is still processing — pump again
    const isProcessing =
      errorCode === 'processing'
      || json.status === 'processing'
      || (json.generationStage as string | undefined) === 'polling_provider'

    return {
      kind:         'application',
      ok:           false,
      status:       res.status,
      message:      errorMessage,
      errorCode,
      errorDetails: (json.errorDetails as string | null | undefined) ?? null,
      failedStage:  (json.failedStage  as string | null | undefined) ?? null,
      retryAt,
      isProcessing,
      executionId:  (json.executionId  as string | null | undefined) ?? null,
      data:         json,
    }
  }

  return {
    kind:    'ok',
    ok:      true,
    status:  res.status,
    message: (json.message as string | undefined) ?? '',
    data:    json,
  }
}
