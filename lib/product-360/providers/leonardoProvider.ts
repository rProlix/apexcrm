// lib/product-360/providers/leonardoProvider.ts
//
// Leonardo AI provider via Blueprint Executions.
//
// Flow for each frame:
//   1. generateFrame() → POST /blueprint-executions → returns pendingExecutionId
//   2. pollExecution() → GET /blueprint-executions/{id} → polls until image URL ready
//
// Configuration (env vars — all server-side only):
//   LEONARDO_API_KEY                        Required
//   LEONARDO_360_BLUEPRINT_VERSION_ID       Required
//   LEONARDO_360_REFERENCE_IMAGE_NODE_ID    Required
//   LEONARDO_360_TEXT_VARIABLES_NODE_ID     Required
//   PRODUCT_360_PROVIDER_POLL_ATTEMPTS      Optional (default 30)
//   PRODUCT_360_PROVIDER_POLL_DELAY_MS      Optional (default 2000)
//
// SERVER-ONLY. Never import from client components.

import type {
  Product360Provider,
  Generate360FrameInput,
  Generate360FrameResult,
  PollExecutionInput,
  PollExecutionResult,
  ProviderError,
} from './types'

// ─── API base ─────────────────────────────────────────────────────────────────

const LEONARDO_API_BASE = 'https://cloud.leonardo.ai/api/rest/v1'

// ─── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    apiKey:               process.env.LEONARDO_API_KEY?.trim()                     ?? '',
    blueprintVersionId:   process.env.LEONARDO_360_BLUEPRINT_VERSION_ID?.trim()    ?? '',
    referenceImageNodeId: process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID?.trim() ?? '',
    textVariablesNodeId:  process.env.LEONARDO_360_TEXT_VARIABLES_NODE_ID?.trim()  ?? '',
    maxPollAttempts:      parseInt(process.env.PRODUCT_360_PROVIDER_POLL_ATTEMPTS  ?? '30', 10) || 30,
    pollDelayMs:          parseInt(process.env.PRODUCT_360_PROVIDER_POLL_DELAY_MS  ?? '2000', 10) || 2000,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Recursive Leonardo response normalizer
//
// Leonardo responses are inconsistent across API versions and blueprint types.
// They may be:
//   - A plain object: { blueprintExecutionJob: { id: '...' } }
//   - An array:       [{ id: '...', status: 'PENDING' }]
//   - An array-as-object: { "0": { id: '...', status: 'PENDING' } }
//   - Deeply nested with outputs inside data.output.images
//
// normalizeLeonardoResponse unwraps every possible container and returns a
// single stable view. It NEVER throws.
// ═════════════════════════════════════════════════════════════════════════════

export type LeonardoNormalizedResponse = {
  raw:          unknown
  candidates:   unknown[]
  imageUrl:     string | null
  executionId:  string | null
  status:       string | null
  isPending:    boolean
  isFailed:     boolean
  failureMessage: string | null
  debug: {
    responseShape:   string
    topLevelKeys:    string[]
    candidateCount:  number
    candidateKeys:   string[][]
    hasImageUrl:     boolean
    hasExecutionId:  boolean
    extractedStatus: string | null
  }
}

// Returns Object.keys safely; empty array for non-objects.
export function getObjectKeysSafe(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.keys(value as Record<string, unknown>)
}

/**
 * Recursively collect every object/array that could contain useful Leonardo data.
 * Handles arrays, array-as-object ({"0": ...}), and known nested keys.
 */
export function unwrapLeonardoCandidates(raw: unknown): unknown[] {
  const candidates: unknown[] = []
  const seen = new Set<unknown>()

  function visit(value: unknown, depth = 0): void {
    if (depth > 6) return
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    candidates.push(value)

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }

    const obj = value as Record<string, unknown>

    // Visit well-known nested container keys
    const nestedKeys = [
      'data', 'result', 'results', 'output', 'outputs', 'response',
      'execution', 'blueprintExecution', 'blueprint_execution',
      'blueprintExecutionJob', 'job',
      'generation', 'generations', 'sdGenerationJob',
      'generated_images', 'generatedImages', 'images', 'artifacts', 'items',
      'blueprintExecutionGenerations', 'generations_by_pk',
    ]
    for (const key of nestedKeys) {
      if (obj[key] !== undefined) visit(obj[key], depth + 1)
    }

    // Visit numeric string keys — covers JSON-serialised arrays: {"0":{...}}
    for (const [key, child] of Object.entries(obj)) {
      if (/^\d+$/.test(key)) visit(child, depth + 1)
    }
  }

  visit(raw)
  return candidates
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** Recursively find the first http/https URL in any value shape. */
export function extractUrlFromValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return /^https?:\/\//i.test(t) ? t : null
  }
  if (!value || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractUrlFromValue(item)
      if (found) return found
    }
    return null
  }

  const obj = value as Record<string, unknown>
  const direct = pickString(obj, [
    'imageUrl', 'image_url', 'url', 'uri', 'src',
    'publicUrl', 'public_url', 'signedUrl', 'signed_url', 'location',
  ])
  if (direct && /^https?:\/\//i.test(direct)) return direct

  for (const child of Object.values(obj)) {
    const found = extractUrlFromValue(child)
    if (found) return found
  }
  return null
}

function extractIdFromCandidates(candidates: unknown[]): string | null {
  const idKeys = [
    'id', 'executionId', 'execution_id',
    'blueprintExecutionId', 'blueprint_execution_id', 'blueprintExecutionJobId',
    'generationId', 'generation_id', 'jobId', 'job_id',
  ]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const id = pickString(candidate as Record<string, unknown>, idKeys)
    if (id) return id
  }
  return null
}

function extractStatusFromCandidates(candidates: unknown[]): string | null {
  const statusKeys = [
    'status', 'state', 'jobStatus', 'job_status',
    'executionStatus', 'execution_status',
  ]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const st = pickString(candidate as Record<string, unknown>, statusKeys)
    if (st) return st.toLowerCase()
  }
  return null
}

function extractFailureMessageFromCandidates(candidates: unknown[]): string | null {
  const messageKeys = [
    'error', 'message', 'failureMessage', 'failure_message',
    'errorMessage', 'error_message', 'reason', 'details',
  ]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const obj = candidate as Record<string, unknown>
    for (const key of messageKeys) {
      const val = obj[key]
      if (typeof val === 'string' && val.trim()) return val.trim()
      if (val && typeof val === 'object') {
        const nested = extractFailureMessageFromCandidates([val])
        if (nested) return nested
      }
    }
  }
  return null
}

const PENDING_STATUSES = new Set([
  'pending', 'queued', 'queue', 'processing', 'running', 'started',
  'generating', 'in_progress', 'in-progress', 'created', 'submitted',
])

const FAILED_STATUSES = new Set([
  'failed', 'error', 'errored', 'cancelled', 'canceled',
  'rejected', 'timeout', 'timed_out',
])

const COMPLETE_STATUSES = new Set([
  'complete', 'completed', 'done', 'success', 'succeeded', 'ready', 'finished',
])

/**
 * The canonical entry point for interpreting any Leonardo API response.
 * Call this immediately after `await res.json()` on any Leonardo endpoint.
 */
export function normalizeLeonardoResponse(raw: unknown): LeonardoNormalizedResponse {
  const candidates  = unwrapLeonardoCandidates(raw)
  const imageUrl    = extractUrlFromValue(raw)       // deep recursive scan
  const executionId = extractIdFromCandidates(candidates)
  const status      = extractStatusFromCandidates(candidates)

  const isPending = status
    ? PENDING_STATUSES.has(status)
    : Boolean(executionId && !imageUrl)   // has ID but no image → assume still processing

  const isFailed = status ? FAILED_STATUSES.has(status) : false

  const failureMessage = isFailed
    ? extractFailureMessageFromCandidates(candidates) ?? 'Leonardo generation failed'
    : null

  return {
    raw,
    candidates,
    imageUrl,
    executionId,
    status,
    isPending,
    isFailed,
    failureMessage,
    debug: {
      responseShape:   Array.isArray(raw) ? 'array'
                       : raw && typeof raw === 'object' ? 'object'
                       : typeof raw,
      topLevelKeys:    getObjectKeysSafe(raw),
      candidateCount:  candidates.length,
      candidateKeys:   candidates
                         .filter(c => c && typeof c === 'object' && !Array.isArray(c))
                         .slice(0, 10)
                         .map(c => getObjectKeysSafe(c)),
      hasImageUrl:     Boolean(imageUrl),
      hasExecutionId:  Boolean(executionId),
      extractedStatus: status,
    },
  }
}

/**
 * Build a sanitized diagnostic from a normalized response.
 * Safe to store in DB — no API keys, no auth headers.
 */
export function buildLeonardoDiagnostic(
  raw: unknown,
  stage: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const n = normalizeLeonardoResponse(raw)
  return {
    provider:        'leonardo',
    stage,
    ...n.debug,
    isPending:       n.isPending,
    isFailed:        n.isFailed,
    failureMessage:  n.failureMessage,
    ...extra,
  }
}

// ─── Error normalizer ─────────────────────────────────────────────────────────

function normalizeError(err: unknown, httpStatus?: number): ProviderError {
  const msg   = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (httpStatus === 401 || httpStatus === 403 || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return { code: 'auth_failed',       message: msg, isRetryable: false, isQuotaError: false }
  }
  if (httpStatus === 429 || lower.includes('429') || lower.includes('quota') || lower.includes('rate limit')) {
    return { code: 'quota_exceeded',    message: msg, isRetryable: true,  isQuotaError: true }
  }
  if (lower.includes('moderat') || lower.includes('nsfw') || lower.includes('content policy')) {
    return { code: 'moderation',        message: msg, isRetryable: false, isQuotaError: false }
  }
  if (lower.includes('blueprint') || (lower.includes('invalid') && httpStatus === 400) || httpStatus === 400) {
    return { code: 'invalid_blueprint', message: msg, isRetryable: false, isQuotaError: false }
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return { code: 'timeout',           message: msg, isRetryable: true,  isQuotaError: false }
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch')) {
    return { code: 'network',           message: msg, isRetryable: true,  isQuotaError: false }
  }
  return { code: 'unknown', message: msg, isRetryable: true, isQuotaError: false }
}

// ─── POST /blueprint-executions ──────────────────────────────────────────────

type CreateExecutionResult =
  | { kind: 'pending';   executionId: string; normalized: LeonardoNormalizedResponse }
  | { kind: 'immediate'; imageUrl:    string;  normalized: LeonardoNormalizedResponse }
  | { kind: 'failed';    error: ProviderError; normalized: LeonardoNormalizedResponse }

async function createBlueprintExecution(
  apiKey:               string,
  blueprintVersionId:   string,
  referenceImageNodeId: string,
  textVariablesNodeId:  string,
  referenceImageUrl:    string,
  textVariables:        string,
): Promise<CreateExecutionResult> {
  const nodeInputs: Array<{ nodeId: string; value: string; settingName: string }> = []
  if (referenceImageNodeId && referenceImageUrl) {
    nodeInputs.push({ nodeId: referenceImageNodeId, value: referenceImageUrl, settingName: 'imageUrl' })
  }
  if (textVariablesNodeId && textVariables) {
    nodeInputs.push({ nodeId: textVariablesNodeId, value: textVariables, settingName: 'textVariables' })
  }

  const body = { blueprintVersionId, input: { nodeInputs, public: true } }

  const res = await fetch(`${LEONARDO_API_BASE}/blueprint-executions`, {
    method:  'POST',
    headers: {
      accept:        'application/json',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let raw: unknown = null
  try { raw = await res.json() } catch { raw = null }

  const normalized = normalizeLeonardoResponse(raw)

  if (!res.ok) {
    const errMsg = normalized.failureMessage
      ?? `Leonardo blueprint-executions HTTP ${res.status}`
    return { kind: 'failed', error: normalizeError(new Error(errMsg), res.status), normalized }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[leonardoProvider] create-execution normalized:', JSON.stringify(normalized.debug))
  }

  // Immediate result — blueprint returned an image without an async job
  if (normalized.imageUrl) {
    return { kind: 'immediate', imageUrl: normalized.imageUrl, normalized }
  }

  // Async path — have an execution ID to poll
  if (normalized.executionId) {
    return { kind: 'pending', executionId: normalized.executionId, normalized }
  }

  // Pending response but no execution ID — misconfigured blueprint
  if (normalized.isPending) {
    return {
      kind:  'failed',
      error: {
        code:         'invalid_blueprint',
        message:      'Leonardo accepted the request but returned no execution id. ' +
                      'Check LEONARDO_360_BLUEPRINT_VERSION_ID and blueprint output configuration.',
        details:      JSON.stringify(normalized.debug),
        isRetryable:  false,
        isQuotaError: false,
      },
      normalized,
    }
  }

  // Unknown shape — not pending, not failed, no useful data
  return {
    kind:  'failed',
    error: {
      code:         'unknown',
      message:      'Leonardo response did not contain an image URL, image buffer, or execution id. ' +
                    `Response shape: ${normalized.debug.responseShape}, ` +
                    `top-level keys: [${normalized.debug.topLevelKeys.join(', ')}].`,
      details:      JSON.stringify(normalized.debug),
      isRetryable:  false,
      isQuotaError: false,
    },
    normalized,
  }
}

// ─── GET /blueprint-executions/{id} ──────────────────────────────────────────

async function pollBlueprintExecution(
  apiKey:      string,
  executionId: string,
): Promise<{ normalized: LeonardoNormalizedResponse }> {
  // Primary polling endpoint
  const res = await fetch(
    `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}`,
    {
      method:  'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
    },
  )

  let raw: unknown = null
  try { raw = await res.json() } catch { raw = null }

  if (!res.ok) {
    if (res.status === 404) {
      throw Object.assign(
        new Error(`Leonardo execution ${executionId} not found (404). The job may have expired.`),
        { providerError: { code: 'invalid_blueprint', message: 'Execution not found', isRetryable: false, isQuotaError: false } as ProviderError },
      )
    }
    const n = normalizeLeonardoResponse(raw)
    throw new Error(`Leonardo poll HTTP ${res.status}: ${n.failureMessage ?? 'unknown error'}`)
  }

  let normalized = normalizeLeonardoResponse(raw)

  // If primary endpoint has no image and no clear status, try /generations suffix as fallback
  if (!normalized.imageUrl && !normalized.isFailed && !COMPLETE_STATUSES.has(normalized.status ?? '')) {
    try {
      const altRes = await fetch(
        `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}/generations`,
        { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` } },
      )
      if (altRes.ok) {
        const altRaw = await altRes.json()
        const altNorm = normalizeLeonardoResponse(altRaw)
        if (altNorm.imageUrl) {
          normalized = { ...normalized, imageUrl: altNorm.imageUrl }
        }
      }
    } catch {
      // Silently ignore fallback errors — primary already succeeded
    }
  }

  return { normalized }
}

// ─── Provider class ───────────────────────────────────────────────────────────

export class LeonardoProduct360Provider implements Product360Provider {
  readonly name = 'leonardo' as const

  isAvailable(): boolean { return this.configErrors().length === 0 }

  configErrors(): string[] {
    const cfg = getConfig(); const errors: string[] = []
    if (!cfg.apiKey)               errors.push('Missing LEONARDO_API_KEY')
    if (!cfg.blueprintVersionId)   errors.push('Missing LEONARDO_360_BLUEPRINT_VERSION_ID')
    if (!cfg.referenceImageNodeId) errors.push('Missing LEONARDO_360_REFERENCE_IMAGE_NODE_ID')
    if (!cfg.textVariablesNodeId)  errors.push('Missing LEONARDO_360_TEXT_VARIABLES_NODE_ID')
    return errors
  }

  async generateFrame(input: Generate360FrameInput): Promise<Generate360FrameResult> {
    const cfg    = getConfig()
    const errors = this.configErrors()
    if (errors.length > 0) {
      return { status: 'failed', mimeType: 'image/png', provider: 'leonardo',
        error: { code: 'missing_env_vars', message: errors.join('; '), isRetryable: false, isQuotaError: false } }
    }

    const refImageUrl   = input.referenceImageUrl ?? null
    const textVariables = input.textVariables ?? input.prompt

    if (!refImageUrl && process.env.NODE_ENV !== 'production') {
      console.warn(
        `[leonardoProvider] frame=${input.frameIndex}: No reference image URL. ` +
        'Upload a reference image via /upload-reference for best results.',
      )
    }

    try {
      if (process.env.NODE_ENV !== 'production') {
        console.info(
          `[leonardoProvider] Creating blueprint execution ` +
          `frame=${input.frameIndex} angle=${input.angleDegrees}° ` +
          `blueprintVersionId=${cfg.blueprintVersionId.slice(0, 8)}… ` +
          `hasReferenceImage=${Boolean(refImageUrl)}`,
        )
      }

      const createResult = await createBlueprintExecution(
        cfg.apiKey, cfg.blueprintVersionId,
        cfg.referenceImageNodeId, cfg.textVariablesNodeId,
        refImageUrl ?? '', textVariables,
      )

      if (createResult.kind === 'immediate') {
        console.info(`[leonardoProvider] Blueprint returned immediate image frame=${input.frameIndex}`)
        return { status: 'completed', imageUrl: createResult.imageUrl, mimeType: 'image/png', provider: 'leonardo' }
      }

      if (createResult.kind === 'pending') {
        console.info(`[leonardoProvider] Execution accepted frame=${input.frameIndex} executionId=${createResult.executionId}`)
        return {
          status:             'pending',
          mimeType:           'image/png',
          provider:           'leonardo',
          pendingExecutionId: createResult.executionId,
        }
      }

      // failed
      console.error(`[leonardoProvider] create-execution failed frame=${input.frameIndex}:`, createResult.error.message)
      return {
        status:      'failed',
        mimeType:    'image/png',
        provider:    'leonardo',
        error:       createResult.error,
        rawResponse: buildLeonardoDiagnostic(createResult.normalized.raw, 'create-execution'),
      }

    } catch (err) {
      const provErr = (err as { providerError?: ProviderError }).providerError ?? normalizeError(err)
      console.error(`[leonardoProvider] generateFrame threw frame=${input.frameIndex}:`, provErr.message)
      return { status: 'failed', mimeType: 'image/png', provider: 'leonardo', error: provErr }
    }
  }

  async pollExecution(input: PollExecutionInput): Promise<PollExecutionResult> {
    const cfg = getConfig()
    if (!cfg.apiKey) {
      return { status: 'failed',
        error: { code: 'missing_env_vars', message: 'LEONARDO_API_KEY is not set', isRetryable: false, isQuotaError: false } }
    }

    const { maxPollAttempts, pollDelayMs } = cfg
    const { executionId } = input

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[leonardoProvider] pollExecution start executionId=${executionId} maxAttempts=${maxPollAttempts} delayMs=${pollDelayMs}`)
    }

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      try {
        const { normalized } = await pollBlueprintExecution(cfg.apiKey, executionId)

        if (process.env.NODE_ENV !== 'production') {
          console.info(
            `[leonardoProvider] poll attempt=${attempt}/${maxPollAttempts} ` +
            `status=${normalized.status} isPending=${normalized.isPending} ` +
            `isFailed=${normalized.isFailed} hasImageUrl=${Boolean(normalized.imageUrl)}`,
          )
        }

        if (normalized.isFailed) {
          return {
            status: 'failed',
            error: {
              code:         'unknown',
              message:      `Leonardo execution failed: ${normalized.failureMessage ?? 'unknown reason'}`,
              details:      JSON.stringify(normalized.debug),
              isRetryable:  false,
              isQuotaError: false,
            },
          }
        }

        if (normalized.imageUrl) {
          // Try to download for buffer upload (preferred); fall back to URL-only
          let imageBuffer: Buffer | undefined
          let mimeType = 'image/png'
          try {
            const imgRes = await fetch(normalized.imageUrl, { signal: AbortSignal.timeout(30_000) })
            if (imgRes.ok) {
              imageBuffer = Buffer.from(await imgRes.arrayBuffer())
              mimeType    = imgRes.headers.get('content-type') ?? 'image/png'
            } else {
              console.warn(`[leonardoProvider] Image download HTTP ${imgRes.status} — using URL directly`)
            }
          } catch (dlErr) {
            console.warn(`[leonardoProvider] Image download failed: ${dlErr instanceof Error ? dlErr.message : dlErr}`)
          }

          console.info(`[leonardoProvider] Execution ${executionId} complete after ${attempt} poll(s)`)
          return {
            status:      'completed',
            imageBuffer,
            imageUrl:    imageBuffer ? undefined : normalized.imageUrl,
            mimeType,
          }
        }

        if (normalized.isPending || !normalized.status) {
          if (attempt < maxPollAttempts) await new Promise(r => setTimeout(r, pollDelayMs))
          continue
        }

        // Some unknown non-pending, non-failed, no-image status — treat as pending and keep trying
        console.warn(`[leonardoProvider] Unknown execution state "${normalized.status}" attempt=${attempt}, waiting`)
        if (attempt < maxPollAttempts) await new Promise(r => setTimeout(r, pollDelayMs))

      } catch (err) {
        const provErr = normalizeError(err)
        if (!provErr.isRetryable) {
          return { status: 'failed', error: provErr }
        }
        console.warn(`[leonardoProvider] Retryable poll error attempt=${attempt}:`, provErr.message)
        if (attempt < maxPollAttempts) await new Promise(r => setTimeout(r, pollDelayMs))
      }
    }

    // Hit max attempts — tell caller to pump again
    const maxWaitSec = Math.round((maxPollAttempts * pollDelayMs) / 1000)
    console.warn(`[leonardoProvider] Execution ${executionId} still pending after ${maxPollAttempts} attempts (${maxWaitSec}s)`)
    return {
      status: 'pending',
      error: {
        code:         'timeout',
        message:      `Leonardo generation is still processing after ${maxWaitSec}s. Pump this package again in a moment to resume.`,
        isRetryable:  true,
        isQuotaError: false,
      },
    }
  }
}

/** Singleton */
let _instance: LeonardoProduct360Provider | null = null
export function getLeonardoProvider(): LeonardoProduct360Provider {
  if (!_instance) _instance = new LeonardoProduct360Provider()
  return _instance
}

// ─── Legacy compat exports ────────────────────────────────────────────────────
// Keep old function names so any remaining callers don't break.

/** @deprecated Use normalizeLeonardoResponse instead */
export function extractLeonardoExecutionId(raw: unknown): string | null {
  return normalizeLeonardoResponse(raw).executionId
}

/** @deprecated Use normalizeLeonardoResponse instead */
export function extractLeonardoImageUrl(raw: unknown): string | null {
  return normalizeLeonardoResponse(raw).imageUrl
}

/** @deprecated Use normalizeLeonardoResponse instead */
export function isLeonardoPending(raw: unknown): boolean {
  return normalizeLeonardoResponse(raw).isPending
}

/** @deprecated Use normalizeLeonardoResponse instead */
export function isLeonardoFailed(raw: unknown): boolean {
  return normalizeLeonardoResponse(raw).isFailed
}

/** @deprecated Use normalizeLeonardoResponse instead */
export function getLeonardoFailureMessage(raw: unknown): string {
  return normalizeLeonardoResponse(raw).failureMessage ?? 'Leonardo generation failed'
}
