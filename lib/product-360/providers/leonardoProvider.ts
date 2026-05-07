// lib/product-360/providers/leonardoProvider.ts
//
// Leonardo AI provider via Blueprint Executions.
//
// Flow for each frame:
//   1. generateFrame() → POST /blueprint-executions → returns pendingExecutionId
//   2. pollExecution() → GET /blueprint-executions/{id} → polls until image URL ready
//
// The pump route stores pendingExecutionId on product_360_frames.provider_execution_id
// and calls pollExecution() on the next pump invocation.
//
// Configuration (env vars — all server-side only):
//   LEONARDO_API_KEY                        Required
//   LEONARDO_360_BLUEPRINT_VERSION_ID       Required
//   LEONARDO_360_REFERENCE_IMAGE_NODE_ID    Required (nodeId for imageUrl input)
//   LEONARDO_360_TEXT_VARIABLES_NODE_ID     Required (nodeId for textVariables input)
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

// ─── Defensive response extractors ───────────────────────────────────────────
//
// Leonardo responses can have many different shapes depending on the
// blueprint type and API version. These extractors check all known field
// paths without assuming a specific shape. They never throw.

/** Extract the execution / job ID from a Leonardo create-execution response. */
export function extractLeonardoExecutionId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Most common shapes from Blueprint Executions API
  const id =
    (r.blueprintExecutionJob  as Record<string, unknown> | undefined)?.id       ??
    (r.blueprintExecution     as Record<string, unknown> | undefined)?.id       ??
    (r.execution              as Record<string, unknown> | undefined)?.id       ??
    r.executionId                                                                ??
    r.blueprintExecutionId                                                       ??
    r.id                                                                         ??
    // Wrapped in data
    (r.data as Record<string, unknown> | undefined)?.id                         ??
    null

  return typeof id === 'string' && id ? id : null
}

/**
 * Extract a ready image URL from any Leonardo response shape.
 * Checks every known field path. Returns the first non-empty URL found.
 */
export function extractLeonardoImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Direct URL fields
  if (typeof r.imageUrl      === 'string' && r.imageUrl)      return r.imageUrl
  if (typeof r.image_url     === 'string' && r.image_url)     return r.image_url
  if (typeof r.url           === 'string' && r.url)           return r.url

  // generations array path (blueprint-executions API)
  const beg = r.blueprintExecutionGenerations as Record<string, unknown> | undefined
  if (beg) {
    const url = extractFromGenerationsArray(beg.generations)
    if (url) return url
  }

  // generation_job path
  const job = r.sdGenerationJob as Record<string, unknown> | undefined
  if (job) {
    if (typeof job.url === 'string' && job.url) return job.url
  }

  // generations_by_pk path
  const byPk = r.generations_by_pk as Record<string, unknown> | undefined
  if (byPk) {
    const url = extractFromImagesArray(byPk.generated_images)
    if (url) return url
  }

  // output / outputs
  if (Array.isArray(r.output)  && r.output.length)  return extractFirstStringUrl(r.output)
  if (Array.isArray(r.outputs) && r.outputs.length) return extractFirstStringUrl(r.outputs)
  if (Array.isArray(r.result)  && r.result.length)  return extractFirstStringUrl(r.result)
  if (Array.isArray(r.results) && r.results.length) return extractFirstStringUrl(r.results)

  // images / artifacts arrays
  if (Array.isArray(r.images)           && r.images.length)           return extractFirstStringUrl(r.images)
  if (Array.isArray(r.generated_images) && r.generated_images.length) return extractFromImagesArray(r.generated_images)
  if (Array.isArray(r.artifacts)        && r.artifacts.length)        return extractFirstStringUrl(r.artifacts)

  // Nested generations top-level array
  if (Array.isArray(r.generations) && r.generations.length) {
    return extractFromGenerationsArray(r.generations)
  }

  // Nested inside data or result
  if (r.data   && typeof r.data   === 'object') return extractLeonardoImageUrl(r.data)
  if (r.result && typeof r.result === 'object' && !Array.isArray(r.result)) return extractLeonardoImageUrl(r.result)

  return null
}

function extractFromGenerationsArray(gens: unknown): string | null {
  if (!Array.isArray(gens)) return null
  for (const gen of gens) {
    if (!gen || typeof gen !== 'object') continue
    const g = gen as Record<string, unknown>
    const url = extractFromImagesArray(g.generated_images)
    if (url) return url
    if (typeof g.url === 'string' && g.url) return g.url
    if (typeof g.imageUrl === 'string' && g.imageUrl) return g.imageUrl
  }
  return null
}

function extractFromImagesArray(imgs: unknown): string | null {
  if (!Array.isArray(imgs)) return null
  for (const img of imgs) {
    if (!img || typeof img !== 'object') continue
    const i = img as Record<string, unknown>
    if (typeof i.url      === 'string' && i.url)      return i.url
    if (typeof i.imageUrl === 'string' && i.imageUrl) return i.imageUrl
    if (typeof i.image_url === 'string' && i.image_url) return i.image_url
  }
  return null
}

function extractFirstStringUrl(arr: unknown[]): string | null {
  for (const item of arr) {
    if (typeof item === 'string' && item.startsWith('http')) return item
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const u = obj.url ?? obj.imageUrl ?? obj.image_url ?? obj.uri
      if (typeof u === 'string' && u.startsWith('http')) return u
    }
  }
  return null
}

/**
 * Determine if a Leonardo execution response indicates the job is still running.
 */
export function isLeonardoPending(raw: unknown): boolean {
  const status = extractLeonardoStatus(raw)
  if (!status) return true   // no status → assume still pending
  const up = status.toUpperCase()
  return up === 'PENDING' || up === 'IN_PROGRESS' || up === 'PROCESSING' || up === 'QUEUED' || up === 'RUNNING'
}

/** Determine if a Leonardo response indicates failure. */
export function isLeonardoFailed(raw: unknown): boolean {
  const status = extractLeonardoStatus(raw)
  if (!status) return false
  const up = status.toUpperCase()
  return up === 'FAILED' || up === 'ERROR' || up === 'CANCELLED' || up === 'CANCELED'
}

/** Extract a failure message from a Leonardo response. */
export function getLeonardoFailureMessage(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return 'Leonardo generation failed (unknown reason)'
  const r = raw as Record<string, unknown>
  return (
    (typeof r.error   === 'string' ? r.error   : null) ??
    (typeof r.message === 'string' ? r.message : null) ??
    (typeof r.detail  === 'string' ? r.detail  : null) ??
    (r.error && typeof r.error === 'object' ? JSON.stringify(r.error).slice(0, 200) : null) ??
    'Leonardo generation failed'
  )
}

function extractLeonardoStatus(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Direct status fields
  if (typeof r.status === 'string') return r.status

  // Nested in common wrappers
  const beg = r.blueprintExecutionGenerations as Record<string, unknown> | undefined
  if (beg && typeof beg.status === 'string') return beg.status

  const job = r.blueprintExecutionJob as Record<string, unknown> | undefined
  if (job && typeof job.status === 'string') return job.status

  const exec = r.blueprintExecution as Record<string, unknown> | undefined
  if (exec && typeof exec.status === 'string') return exec.status

  // generations array: look for a generation-level status
  const gens = Array.isArray(r.generations) ? r.generations : null
  if (gens?.length) {
    const g = gens[0] as Record<string, unknown> | undefined
    if (g && typeof g.status === 'string') return g.status
  }

  return null
}

/**
 * Build a sanitized diagnostic object from a raw Leonardo response.
 * Safe to store in the DB — no API keys, no Authorization headers.
 */
export function buildLeonardoDiagnostic(
  raw: unknown,
  stage: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const keys = raw && typeof raw === 'object' ? Object.keys(raw as object) : []
  return {
    provider:         'leonardo',
    stage,
    responseKeys:     keys,
    hasExecutionId:   !!extractLeonardoExecutionId(raw),
    hasImageUrl:      !!extractLeonardoImageUrl(raw),
    isPending:        isLeonardoPending(raw),
    isFailed:         isLeonardoFailed(raw),
    extractedStatus:  extractLeonardoStatus(raw) ?? null,
    failureMessage:   isLeonardoFailed(raw) ? getLeonardoFailureMessage(raw) : null,
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
  if (lower.includes('blueprint') || (lower.includes('invalid') && httpStatus === 400)) {
    return { code: 'invalid_blueprint', message: msg, isRetryable: false, isQuotaError: false }
  }
  if (httpStatus === 400) {
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

async function createBlueprintExecution(
  apiKey:               string,
  blueprintVersionId:   string,
  referenceImageNodeId: string,
  textVariablesNodeId:  string,
  referenceImageUrl:    string,
  textVariables:        string,
): Promise<{ executionId: string; raw: unknown }> {
  const nodeInputs: Array<{ nodeId: string; value: string; settingName: string }> = []

  if (referenceImageNodeId && referenceImageUrl) {
    nodeInputs.push({ nodeId: referenceImageNodeId, value: referenceImageUrl, settingName: 'imageUrl' })
  }
  if (textVariablesNodeId && textVariables) {
    nodeInputs.push({ nodeId: textVariablesNodeId, value: textVariables, settingName: 'textVariables' })
  }

  const body = {
    blueprintVersionId,
    input: { nodeInputs, public: true },
  }

  const res = await fetch(`${LEONARDO_API_BASE}/blueprint-executions`, {
    method:  'POST',
    headers: {
      'accept':        'application/json',
      'authorization': `Bearer ${apiKey}`,
      'content-type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  let raw: unknown = null
  try { raw = await res.json() } catch { raw = null }

  if (!res.ok) {
    const errMsg = getLeonardoFailureMessage(raw) || `HTTP ${res.status}`
    const err    = normalizeError(new Error(errMsg), res.status)
    throw Object.assign(new Error(err.message), { providerError: err, raw })
  }

  // Try to extract execution ID defensively
  const executionId = extractLeonardoExecutionId(raw)

  if (executionId) {
    return { executionId, raw }
  }

  // Blueprint might have returned an immediate image URL instead of an async ID
  const immediateUrl = extractLeonardoImageUrl(raw)
  if (immediateUrl) {
    // Treat as a pseudo-execution with a synthetic ID so the caller can track it
    // Return a special marker so the caller knows it's immediate
    return { executionId: `immediate:${immediateUrl}`, raw }
  }

  // No ID and no image — unexpected response
  const diag = buildLeonardoDiagnostic(raw, 'create-execution', {
    httpStatus: res.status,
    responsePreview: JSON.stringify(raw).slice(0, 200),
  })
  throw Object.assign(
    new Error(
      `Leonardo blueprint execution accepted (HTTP ${res.status}) but response contained ` +
      `neither an execution ID nor an image URL. ` +
      `Response keys: [${diag.responseKeys}]. ` +
      `Check your LEONARDO_360_BLUEPRINT_VERSION_ID and blueprint configuration.`,
    ),
    { providerError: normalizeError(new Error('invalid_blueprint'), 400), raw, diagnostic: diag },
  )
}

// ─── GET /blueprint-executions/{id} ──────────────────────────────────────────
//
// Primary polling endpoint. Leonardo also supports /blueprint-executions/{id}/generations
// as an alternative shape; we try the primary endpoint and fall back if needed.

async function pollBlueprintExecution(
  apiKey:      string,
  executionId: string,
): Promise<{ raw: unknown; imageUrl: string | null; isPending: boolean; isFailed: boolean }> {
  // Primary endpoint (no /generations suffix)
  const url = `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}`

  const res = await fetch(url, {
    method:  'GET',
    headers: {
      'accept':        'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
  })

  let raw: unknown = null
  try { raw = await res.json() } catch { raw = null }

  if (!res.ok) {
    if (res.status === 404) {
      // Execution ID no longer known — treat as a hard failure
      throw Object.assign(
        new Error(`Leonardo execution ${executionId} not found (HTTP 404). The job may have expired.`),
        { providerError: { code: 'invalid_blueprint', message: 'Execution not found', isRetryable: false, isQuotaError: false } as ProviderError },
      )
    }
    throw new Error(`Leonardo poll HTTP ${res.status}: ${getLeonardoFailureMessage(raw)}`)
  }

  // Try to extract image URL from the primary response
  let imageUrl = extractLeonardoImageUrl(raw)

  // If primary response has no image URL, try the /generations suffix as fallback
  if (!imageUrl && !isLeonardoFailed(raw) && !isLeonardoPending(raw)) {
    try {
      const altRes = await fetch(
        `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}/generations`,
        { method: 'GET', headers: { 'accept': 'application/json', 'authorization': `Bearer ${apiKey}` } },
      )
      if (altRes.ok) {
        const altRaw = await altRes.json()
        const altUrl = extractLeonardoImageUrl(altRaw)
        if (altUrl) imageUrl = altUrl
        // Merge alt raw into diagnostics
        raw = { primary: raw, generations: altRaw }
      }
    } catch {
      // Silently ignore fallback errors
    }
  }

  return {
    raw,
    imageUrl,
    isPending: isLeonardoPending(raw),
    isFailed:  isLeonardoFailed(raw),
  }
}

// ─── Provider class ───────────────────────────────────────────────────────────

export class LeonardoProduct360Provider implements Product360Provider {
  readonly name = 'leonardo' as const

  isAvailable(): boolean {
    return this.configErrors().length === 0
  }

  configErrors(): string[] {
    const cfg    = getConfig()
    const errors: string[] = []
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
      return {
        status:   'failed',
        mimeType: 'image/png',
        provider: 'leonardo',
        error: { code: 'missing_env_vars', message: errors.join('; '), isRetryable: false, isQuotaError: false },
      }
    }

    // ── Reference image resolution ────────────────────────────────────────
    //
    // Priority: input.referenceImageUrl → master_frame_url (passed as referenceImageBase64
    // means we don't have the URL directly) → fail with a clear message.
    //
    // For Leonardo we NEED a URL (not base64) since the blueprint imageUrl node
    // expects an accessible public URL.

    const refImageUrl = input.referenceImageUrl ?? null

    if (!refImageUrl) {
      console.warn(
        `[leonardoProvider] frame=${input.frameIndex}: No reference image URL. ` +
        `Upload a reference image via /upload-reference for best results. ` +
        `Proceeding without reference (textVariables only).`,
      )
    }

    const textVariables = input.textVariables ?? input.prompt

    try {
      if (process.env.NODE_ENV !== 'production') {
        console.info(
          `[leonardoProvider] Creating blueprint execution ` +
          `frame=${input.frameIndex} angle=${input.angleDegrees}° ` +
          `blueprintVersionId=${cfg.blueprintVersionId.slice(0, 8)}… ` +
          `hasReferenceImage=${!!refImageUrl}`,
        )
      }

      const { executionId, raw } = await createBlueprintExecution(
        cfg.apiKey,
        cfg.blueprintVersionId,
        cfg.referenceImageNodeId,
        cfg.textVariablesNodeId,
        refImageUrl ?? '',
        textVariables,
      )

      // Special case: Leonardo returned an immediate image (synchronous blueprint)
      if (executionId.startsWith('immediate:')) {
        const immediateUrl = executionId.slice('immediate:'.length)
        console.info(`[leonardoProvider] Blueprint returned immediate image URL frame=${input.frameIndex}`)
        return {
          status:   'completed',
          imageUrl: immediateUrl,
          mimeType: 'image/png',
          provider: 'leonardo',
        }
      }

      console.info(`[leonardoProvider] Execution accepted frame=${input.frameIndex} executionId=${executionId}`)

      // Log sanitized diagnostic in dev only
      if (process.env.NODE_ENV !== 'production') {
        console.info('[leonardoProvider] create-execution diagnostic:', buildLeonardoDiagnostic(raw, 'create-execution'))
      }

      return {
        status:             'pending',
        mimeType:           'image/png',
        provider:           'leonardo',
        pendingExecutionId: executionId,
      }

    } catch (err) {
      const provErr = (err as { providerError?: ProviderError }).providerError
      const raw     = (err as { raw?: unknown }).raw
      const diag    = buildLeonardoDiagnostic(raw, 'create-execution')

      console.error(`[leonardoProvider] generateFrame failed frame=${input.frameIndex}:`, provErr?.message ?? err)

      return {
        status:   'failed',
        mimeType: 'image/png',
        provider: 'leonardo',
        error:    provErr ?? normalizeError(err),
        rawResponse: diag,
      }
    }
  }

  async pollExecution(input: PollExecutionInput): Promise<PollExecutionResult> {
    const cfg = getConfig()
    if (!cfg.apiKey) {
      return {
        status: 'failed',
        error: { code: 'missing_env_vars', message: 'LEONARDO_API_KEY is not set', isRetryable: false, isQuotaError: false },
      }
    }

    const { maxPollAttempts, pollDelayMs } = cfg
    const executionId = input.executionId

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[leonardoProvider] pollExecution start executionId=${executionId} ` +
        `maxAttempts=${maxPollAttempts} delayMs=${pollDelayMs}`,
      )
    }

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      try {
        const { raw, imageUrl, isPending, isFailed } = await pollBlueprintExecution(cfg.apiKey, executionId)

        if (process.env.NODE_ENV !== 'production') {
          console.info(
            `[leonardoProvider] poll attempt=${attempt}/${maxPollAttempts} ` +
            `isPending=${isPending} isFailed=${isFailed} hasImageUrl=${!!imageUrl}`,
          )
        }

        if (isFailed) {
          const errMsg = getLeonardoFailureMessage(raw)
          console.error(`[leonardoProvider] Execution ${executionId} failed: ${errMsg}`)
          return {
            status: 'failed',
            error: {
              code:         'unknown',
              message:      `Leonardo execution failed: ${errMsg}`,
              details:      JSON.stringify(buildLeonardoDiagnostic(raw, 'poll-failed')),
              isRetryable:  false,
              isQuotaError: false,
            },
          }
        }

        if (imageUrl) {
          // Image URL is ready — try to download it for direct buffer upload
          let imageBuffer: Buffer | undefined
          let mimeType = 'image/png'

          try {
            const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) })
            if (imgRes.ok) {
              imageBuffer = Buffer.from(await imgRes.arrayBuffer())
              mimeType    = imgRes.headers.get('content-type') ?? 'image/png'
            } else {
              console.warn(`[leonardoProvider] Image download HTTP ${imgRes.status} — will return URL instead`)
            }
          } catch (dlErr) {
            console.warn(`[leonardoProvider] Image download failed, returning URL: ${dlErr instanceof Error ? dlErr.message : dlErr}`)
          }

          console.info(`[leonardoProvider] Execution ${executionId} complete after ${attempt} poll(s)`)

          return {
            status:      'completed',
            imageBuffer,
            imageUrl:    imageBuffer ? undefined : imageUrl,   // prefer buffer; fall back to URL
            mimeType,
          }
        }

        if (isPending) {
          // Not done yet — wait before next attempt
          if (attempt < maxPollAttempts) {
            await new Promise(r => setTimeout(r, pollDelayMs))
          }
          continue
        }

        // Unknown state — treat as pending and keep waiting
        console.warn(`[leonardoProvider] Unknown execution state attempt=${attempt}, treating as pending`)
        if (attempt < maxPollAttempts) {
          await new Promise(r => setTimeout(r, pollDelayMs))
        }

      } catch (err) {
        const provErr = normalizeError(err)
        if (!provErr.isRetryable) {
          console.error(`[leonardoProvider] Non-retryable poll error attempt=${attempt}:`, provErr.message)
          return { status: 'failed', error: provErr }
        }
        console.warn(`[leonardoProvider] Retryable poll error attempt=${attempt}:`, provErr.message)
        if (attempt < maxPollAttempts) {
          await new Promise(r => setTimeout(r, pollDelayMs))
        }
      }
    }

    // Reached max attempts without a result
    const maxWaitSec = Math.round((maxPollAttempts * pollDelayMs) / 1000)
    console.warn(
      `[leonardoProvider] Execution ${executionId} still pending after ${maxPollAttempts} attempts ` +
      `(${maxWaitSec}s). Will retry on next pump call.`,
    )

    return {
      status: 'pending',
      error: {
        code:         'timeout',
        message:      `Leonardo generation is still processing after ${maxWaitSec}s. ` +
                      `Pump this package again in a moment to resume polling.`,
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
