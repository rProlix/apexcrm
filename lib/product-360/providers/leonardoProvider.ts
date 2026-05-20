// lib/product-360/providers/leonardoProvider.ts
//
// Leonardo AI provider via Blueprint Executions.
//
// Flow for each frame:
//   1. generateFrame() → POST /blueprint-executions → returns pendingExecutionId
//   2. pollExecution() → GET /blueprint-executions/{id} → polls until image URL ready
//
// Configuration (env vars — all server-side only):
//   LEONARDO_API_KEY                           Required
//   LEONARDO_360_BLUEPRINT_VERSION_ID          Required
//   LEONARDO_360_REFERENCE_IMAGE_NODE_ID       Required
//   LEONARDO_360_TEXT_VARIABLES_NODE_ID        Required
//   LEONARDO_360_EXTRA_TEXT_VARIABLE_NODE_IDS  Optional  comma-separated extra text-variable node IDs
//   LEONARDO_360_OUTPUT_IMAGE_NODE_ID          Optional  preferred output image node
//   LEONARDO_360_TEXT_VARIABLES_FORMAT         Optional  json | text, default text
//   LEONARDO_360_POLL_INTERVAL_MS              Optional  default 3000
//   LEONARDO_360_MAX_POLL_ATTEMPTS             Optional  default 40
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
  const extraRaw = process.env.LEONARDO_360_EXTRA_TEXT_VARIABLE_NODE_IDS?.trim() ?? ''
  const extraNodeIds = extraRaw
    ? extraRaw.split(',').map(s => s.trim()).filter(Boolean)
    : []

  return {
    apiKey:               process.env.LEONARDO_API_KEY?.trim()                     ?? '',
    blueprintVersionId:   process.env.LEONARDO_360_BLUEPRINT_VERSION_ID?.trim()    ?? '',
    referenceImageNodeId: process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID?.trim() ?? '',
    textVariablesNodeId:  process.env.LEONARDO_360_TEXT_VARIABLES_NODE_ID?.trim()  ?? '',
    outputImageNodeId:    process.env.LEONARDO_360_OUTPUT_IMAGE_NODE_ID?.trim()    ?? '',
    textVariablesFormat:  (process.env.LEONARDO_360_TEXT_VARIABLES_FORMAT?.trim().toLowerCase() === 'json' ? 'json' : 'text') as 'json' | 'text',
    extraTextVariableNodeIds: extraNodeIds,
    maxPollAttempts:      parseInt(process.env.LEONARDO_360_MAX_POLL_ATTEMPTS ?? process.env.PRODUCT_360_PROVIDER_POLL_ATTEMPTS ?? '40', 10) || 40,
    pollDelayMs:          parseInt(process.env.LEONARDO_360_POLL_INTERVAL_MS ?? process.env.PRODUCT_360_PROVIDER_POLL_DELAY_MS ?? '3000', 10) || 3000,
  }
}

export type Leonardo360FrameInput = {
  packageId: string
  frameIndex: number
  angleDegrees: number
  referenceImageUrl: string
  productName: string
  productDescription?: string | null
  lockedScenePrompt: string
  sceneBlueprint: Record<string, unknown>
  width?: number
  height?: number
}

export type GeneratedImageResult = {
  provider: 'leonardo'
  imageUrl?: string
  imageBuffer?: Buffer
  mimeType?: string
  executionId?: string
  raw?: unknown
}

// ═════════════════════════════════════════════════════════════════════════════
// Recursive Leonardo response normalizer
//
// Leonardo can return:
//   - A plain object:          { blueprintExecutionJob: { id: '...' } }
//   - An array:                [{ id: '...', status: 'PENDING' }]
//   - An array-as-object:      { "0": { id: '...', status: 'PENDING' } }
//   - A GraphQL error array:   [{ extensions: {...}, locations: [...], message: '...', path: [...] }]
//   - Deeply nested outputs:   { data: { output: { images: [{ url: '...' }] } } }
//
// normalizeLeonardoResponse is the single entry point for all response parsing.
// It never throws.
// ═════════════════════════════════════════════════════════════════════════════

export type LeonardoNormalizedResponse = {
  raw:           unknown
  candidates:    unknown[]
  imageUrl:      string | null
  executionId:   string | null
  status:        string | null
  isPending:     boolean
  isFailed:      boolean
  failureMessage: string | null
  debug: {
    responseShape:        string
    topLevelKeys:         string[]
    candidateCount:       number
    candidateKeys:        string[][]
    candidateOutputKeys:  string[][]
    hasImageUrl:          boolean
    hasExecutionId:       boolean
    extractedStatus:      string | null
    hasApiError:          boolean
    errorKeys:            string[][]    // candidate keys from error-shaped objects
    errorMessagesPreview: string[]      // first 2 sanitized messages from errors
  }
}

// Returns Object.keys safely; empty array for non-objects.
export function getObjectKeysSafe(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.keys(value as Record<string, unknown>)
}

/**
 * Detect Leonardo/GraphQL-style API error objects.
 * These have a `message` string plus at least one of: extensions, locations, path, errors, error.
 */
export function looksLikeLeonardoErrorObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
  return (
    typeof obj.message === 'string' &&
    (
      keys.includes('extensions') ||
      keys.includes('locations') ||
      keys.includes('path') ||
      keys.includes('errors') ||
      keys.includes('error')
    )
  )
}

/**
 * Recursively extract all string messages from any Leonardo error structure.
 */
export function extractLeonardoErrorMessages(value: unknown): string[] {
  const messages: string[] = []
  const seen = new Set<unknown>()

  function visit(input: unknown, depth = 0): void {
    if (depth > 8) return
    if (!input || typeof input !== 'object') return
    if (seen.has(input)) return
    seen.add(input)

    if (Array.isArray(input)) {
      for (const item of input) visit(item, depth + 1)
      return
    }

    const obj = input as Record<string, unknown>
    if (typeof obj.message      === 'string' && obj.message.trim())      messages.push(obj.message.trim())
    if (typeof obj.error        === 'string' && obj.error.trim())        messages.push(obj.error.trim())
    if (typeof obj.errorMessage === 'string' && obj.errorMessage.trim()) messages.push(obj.errorMessage.trim())
    if (typeof obj.failureMessage === 'string' && obj.failureMessage.trim()) messages.push(obj.failureMessage.trim())

    for (const key of ['errors', 'error', 'extensions', 'details', 'data', 'response', 'result']) {
      if (obj[key] !== undefined) visit(obj[key], depth + 1)
    }
  }

  visit(value)
  return Array.from(new Set(messages)).filter(Boolean)
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

function extractUrlForOutputNode(value: unknown, outputNodeId: string): string | null {
  if (!outputNodeId || !value || typeof value !== 'object') return null
  const seen = new Set<unknown>()

  function visit(input: unknown, depth = 0): string | null {
    if (depth > 9 || !input || typeof input !== 'object') return null
    if (seen.has(input)) return null
    seen.add(input)

    if (Array.isArray(input)) {
      for (const item of input) {
        const found = visit(item, depth + 1)
        if (found) return found
      }
      return null
    }

    const obj = input as Record<string, unknown>
    const nodeId =
      typeof obj.nodeId === 'string' ? obj.nodeId :
      typeof obj.node_id === 'string' ? obj.node_id :
      typeof obj.id === 'string' ? obj.id :
      typeof obj.outputNodeId === 'string' ? obj.outputNodeId :
      null

    if (nodeId === outputNodeId) {
      const direct = extractUrlFromValue(obj)
      if (direct) return direct
    }

    for (const child of Object.values(obj)) {
      const found = visit(child, depth + 1)
      if (found) return found
    }
    return null
  }

  return visit(value)
}

function extractIdFromCandidates(candidates: unknown[]): string | null {
  const idKeys = [
    'id', 'executionId', 'execution_id',
    'blueprintExecutionId', 'blueprint_execution_id', 'blueprintExecutionJobId',
    'generationId', 'generation_id', 'jobId', 'job_id',
  ]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    // Skip error-shaped objects — they might have an 'id' that is a path element not an execution id
    if (looksLikeLeonardoErrorObject(candidate)) continue
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
    if (looksLikeLeonardoErrorObject(candidate)) continue
    const st = pickString(candidate as Record<string, unknown>, statusKeys)
    if (st) return st.toLowerCase()
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
 *
 * Handles:
 *  - GraphQL error arrays: [{ extensions, locations, message, path }]
 *  - Array-at-root:        [{ id, status }]
 *  - Array-as-object:      { "0": { id, status } }
 *  - Nested outputs
 */
export function normalizeLeonardoResponse(raw: unknown, outputImageNodeId = getConfig().outputImageNodeId): LeonardoNormalizedResponse {
  const candidates  = unwrapLeonardoCandidates(raw)

  // ── GraphQL / API error detection ──────────────────────────────────────────
  // Leonardo returns errors as arrays of objects with keys like:
  //   { extensions, locations, message, path }
  // These must be detected BEFORE attempting to extract execution IDs or images.
  const errorCandidates = candidates.filter(looksLikeLeonardoErrorObject)
  const hasApiError     = errorCandidates.length > 0
  const errorKeys       = errorCandidates
    .slice(0, 5)
    .map(c => getObjectKeysSafe(c))

  let apiErrorMessages: string[] = []
  if (hasApiError) {
    apiErrorMessages = extractLeonardoErrorMessages(raw)
  }

  // ── Normal extraction ──────────────────────────────────────────────────────
  const imageUrl    = extractUrlForOutputNode(raw, outputImageNodeId) ?? extractUrlFromValue(raw)
  const executionId = hasApiError ? null : extractIdFromCandidates(candidates)
  const status      = hasApiError ? 'failed' : extractStatusFromCandidates(candidates)

  // ── Determine terminal state ───────────────────────────────────────────────
  let isPending: boolean
  let isFailed:  boolean
  let failureMessage: string | null

  if (hasApiError) {
    isPending      = false
    isFailed       = true
    failureMessage = apiErrorMessages.length > 0
      ? apiErrorMessages.join(' | ')
      : 'Leonardo rejected the request (API/GraphQL error)'
  } else if (imageUrl) {
    isPending      = false
    isFailed       = false
    failureMessage = null
  } else {
    isPending = status
      ? PENDING_STATUSES.has(status)
      : Boolean(executionId)  // has ID but no image → still running
    isFailed  = status ? FAILED_STATUSES.has(status) : false
    failureMessage = isFailed
      ? extractLeonardoErrorMessages(raw)[0] ?? 'Leonardo generation failed'
      : null
  }

  const allCandidateKeys = candidates
    .filter(c => c && typeof c === 'object' && !Array.isArray(c))
    .slice(0, 10)
    .map(c => getObjectKeysSafe(c))

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
      responseShape:        Array.isArray(raw) ? 'array'
                            : raw && typeof raw === 'object' ? 'object'
                            : typeof raw,
      topLevelKeys:         getObjectKeysSafe(raw),
      candidateCount:       candidates.length,
      candidateKeys:        allCandidateKeys,
      candidateOutputKeys:   allCandidateKeys,
      hasImageUrl:          Boolean(imageUrl),
      hasExecutionId:       Boolean(executionId),
      extractedStatus:      status,
      hasApiError,
      errorKeys,
      errorMessagesPreview: apiErrorMessages.slice(0, 2),
    },
  }
}

/**
 * Build a sanitized diagnostic from a normalized response.
 * Safe to store in DB and show in UI — no API keys, no auth headers.
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

// ─── Request payload debug (no secrets) ──────────────────────────────────────

function buildRequestDebug(
  cfg:            ReturnType<typeof getConfig>,
  referenceImageUrl: string | null,
  textVariables:  string,
  nodeInputCount: number,
  settingNames:   string[],
) {
  return {
    blueprintVersionIdPresent:   Boolean(cfg.blueprintVersionId),
    referenceImageNodeIdPresent: Boolean(cfg.referenceImageNodeId),
    textVariablesNodeIdPresent:  Boolean(cfg.textVariablesNodeId),
    extraNodeCount:              cfg.extraTextVariableNodeIds.length,
    nodeInputCount,
    settingNames,
    hasReferenceImageUrl:        Boolean(referenceImageUrl),
    textVariablesLength:         textVariables.length,
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
  | { kind: 'pending';   executionId: string; normalized: LeonardoNormalizedResponse; requestDebug: Record<string, unknown> }
  | { kind: 'immediate'; imageUrl:    string;  normalized: LeonardoNormalizedResponse; requestDebug: Record<string, unknown> }
  | { kind: 'failed';    error: ProviderError; normalized: LeonardoNormalizedResponse; requestDebug: Record<string, unknown> }

async function createBlueprintExecution(
  cfg:               ReturnType<typeof getConfig>,
  referenceImageUrl: string | null,
  textVariables:     string,
): Promise<CreateExecutionResult> {
  const nodeInputs: Array<{ nodeId: string; value: string; settingName: string }> = []

  if (cfg.referenceImageNodeId && referenceImageUrl) {
    nodeInputs.push({ nodeId: cfg.referenceImageNodeId, value: referenceImageUrl, settingName: 'imageUrl' })
  }
  if (cfg.textVariablesNodeId && textVariables) {
    nodeInputs.push({ nodeId: cfg.textVariablesNodeId, value: textVariables, settingName: 'textVariables' })
  }
  // Optional extra text-variable nodes (multi-node blueprints)
  for (const nodeId of cfg.extraTextVariableNodeIds) {
    nodeInputs.push({ nodeId, value: textVariables, settingName: 'textVariables' })
  }

  const body = { blueprintVersionId: cfg.blueprintVersionId, input: { nodeInputs, public: true } }
  const settingNames = nodeInputs.map(n => n.settingName)
  const reqDebug = buildRequestDebug(cfg, referenceImageUrl, textVariables, nodeInputs.length, settingNames)

  const res = await fetch(`${LEONARDO_API_BASE}/blueprint-executions`, {
    method:  'POST',
    headers: {
      accept:         'application/json',
      authorization:  `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let raw: unknown = null
  try { raw = await res.json() } catch { raw = null }

  const normalized = normalizeLeonardoResponse(raw)

  if (process.env.NODE_ENV !== 'production') {
    console.info('[leonardoProvider] create-execution HTTP', res.status)
    console.info('[leonardoProvider] create-execution debug:', JSON.stringify({ ...normalized.debug, reqDebug }))
  }

  // HTTP-level failure (4xx/5xx) — combine with response body parsing
  if (!res.ok) {
    const errMsg = normalized.failureMessage
      ?? normalized.debug.errorMessagesPreview[0]
      ?? `Leonardo blueprint-executions HTTP ${res.status}`
    return {
      kind:  'failed',
      error: normalizeError(new Error(errMsg), res.status),
      normalized,
      requestDebug: { ...reqDebug, httpStatus: res.status },
    }
  }

  // GraphQL / API error in the response body (200 OK but error payload)
  if (normalized.isFailed) {
    const errMsg = normalized.failureMessage ?? 'Leonardo rejected the blueprint execution request'
    console.error(`[leonardoProvider] create-execution API error: ${errMsg}`)

    // Provide actionable guidance based on error content
    let hint = ''
    const lower = errMsg.toLowerCase()
    if (lower.includes('imageurl') || lower.includes('image_url') || lower.includes('required')) {
      hint = ' Make sure LEONARDO_360_REFERENCE_IMAGE_NODE_ID is correct and a reference image URL is provided.'
    } else if (lower.includes('textvariables') || lower.includes('text_variables')) {
      hint = ' Make sure LEONARDO_360_TEXT_VARIABLES_NODE_ID is correct and text variables are provided.'
    } else if (lower.includes('blueprintversion') || lower.includes('blueprint')) {
      hint = ' Make sure LEONARDO_360_BLUEPRINT_VERSION_ID matches a published blueprint you have access to.'
    } else if (lower.includes('node') || lower.includes('nodeid') || lower.includes('node_id')) {
      hint = ' Make sure LEONARDO_360_REFERENCE_IMAGE_NODE_ID and LEONARDO_360_TEXT_VARIABLES_NODE_ID match the node IDs in your blueprint.'
    }

    return {
      kind:  'failed',
      error: {
        code:         'invalid_blueprint',
        message:      errMsg + hint,
        details:      JSON.stringify({ ...normalized.debug, ...reqDebug }),
        isRetryable:  false,
        isQuotaError: false,
      },
      normalized,
      requestDebug: reqDebug,
    }
  }

  // Immediate result — blueprint returned an image without an async job
  if (normalized.imageUrl) {
    return { kind: 'immediate', imageUrl: normalized.imageUrl, normalized, requestDebug: reqDebug }
  }

  // Async path — have an execution ID to poll
  if (normalized.executionId) {
    return { kind: 'pending', executionId: normalized.executionId, normalized, requestDebug: reqDebug }
  }

  // Pending response but no execution ID
  if (normalized.isPending) {
    return {
      kind:  'failed',
      error: {
        code:         'invalid_blueprint',
        message:      'Leonardo accepted the request but returned no execution id. ' +
                      'Check LEONARDO_360_BLUEPRINT_VERSION_ID and blueprint output configuration.',
        details:      JSON.stringify({ ...normalized.debug, ...reqDebug }),
        isRetryable:  false,
        isQuotaError: false,
      },
      normalized,
      requestDebug: reqDebug,
    }
  }

  // Unknown shape
  return {
    kind:  'failed',
    error: {
      code:         'unknown',
      message:      'Leonardo did not return an image URL or execution id. ' +
                    `Response shape: ${normalized.debug.responseShape}, ` +
                    `keys: [${normalized.debug.topLevelKeys.join(', ')}]. ` +
                    'Check blueprint output configuration and node IDs.',
      details:      JSON.stringify({ ...normalized.debug, ...reqDebug }),
      isRetryable:  false,
      isQuotaError: false,
    },
    normalized,
    requestDebug: reqDebug,
  }
}

// ─── GET /blueprint-executions/{id} ──────────────────────────────────────────

async function pollBlueprintExecution(
  apiKey:      string,
  executionId: string,
): Promise<{ normalized: LeonardoNormalizedResponse }> {
  const res = await fetch(
    `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}`,
    { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` } },
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

  // Try /generations suffix as fallback when primary has no image and is not failed
  if (!normalized.imageUrl && !normalized.isFailed && !COMPLETE_STATUSES.has(normalized.status ?? '')) {
    try {
      const altRes = await fetch(
        `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}/generations`,
        { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` } },
      )
      if (altRes.ok) {
        const altRaw = await altRes.json()
        const altNorm = normalizeLeonardoResponse(altRaw)
        if (altNorm.imageUrl) normalized = { ...normalized, imageUrl: altNorm.imageUrl }
      }
    } catch { /* Silently ignore fallback errors */ }
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
      console.warn(`[leonardoProvider] frame=${input.frameIndex}: No reference image URL. Upload a reference image for best results.`)
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[leonardoProvider] Creating blueprint execution ` +
        `frame=${input.frameIndex} angle=${input.angleDegrees}° ` +
        `blueprintVersionId=${cfg.blueprintVersionId.slice(0, 8)}… ` +
        `hasReferenceImage=${Boolean(refImageUrl)}`,
      )
    }

    try {
      const createResult = await createBlueprintExecution(cfg, refImageUrl, textVariables)

      if (createResult.kind === 'immediate') {
        console.info(`[leonardoProvider] Blueprint returned immediate image frame=${input.frameIndex}`)
        return { status: 'completed', imageUrl: createResult.imageUrl, mimeType: 'image/png', provider: 'leonardo' }
      }

      if (createResult.kind === 'pending') {
        console.info(`[leonardoProvider] Execution accepted frame=${input.frameIndex} executionId=${createResult.executionId}`)
        return { status: 'pending', mimeType: 'image/png', provider: 'leonardo', pendingExecutionId: createResult.executionId }
      }

      // Failed — build diagnostic from the normalized response (no secrets)
      const diag = buildLeonardoDiagnostic(createResult.normalized.raw, 'create-execution', createResult.requestDebug)
      console.error(`[leonardoProvider] create-execution failed frame=${input.frameIndex}: ${createResult.error.message}`)

      return { status: 'failed', mimeType: 'image/png', provider: 'leonardo', error: createResult.error, rawResponse: diag }

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
            `isFailed=${normalized.isFailed} hasImageUrl=${Boolean(normalized.imageUrl)} ` +
            `hasApiError=${normalized.debug.hasApiError}`,
          )
        }

        if (normalized.isFailed) {
          return {
            status: 'failed',
            error: {
              code:         'unknown',
              message:      normalized.failureMessage ?? `Leonardo execution failed`,
              details:      JSON.stringify(normalized.debug),
              isRetryable:  false,
              isQuotaError: false,
            },
          }
        }

        if (normalized.imageUrl) {
          let imageBuffer: Buffer | undefined
          let mimeType = 'image/png'
          try {
            const imgRes = await fetch(normalized.imageUrl, { signal: AbortSignal.timeout(30_000) })
            if (imgRes.ok) {
              const contentType = imgRes.headers.get('content-type') ?? ''
              if (contentType.toLowerCase().startsWith('image/')) {
                imageBuffer = Buffer.from(await imgRes.arrayBuffer())
                mimeType    = contentType
              } else {
                console.warn(`[leonardoProvider] Image download returned non-image content-type "${contentType}" — using URL directly`)
              }
            } else {
              console.warn(`[leonardoProvider] Image download HTTP ${imgRes.status} — using URL directly`)
            }
          } catch (dlErr) {
            console.warn(`[leonardoProvider] Image download failed: ${dlErr instanceof Error ? dlErr.message : dlErr}`)
          }

          console.info(`[leonardoProvider] Execution ${executionId} complete after ${attempt} poll(s)`)
          return { status: 'completed', imageBuffer, imageUrl: imageBuffer ? undefined : normalized.imageUrl, mimeType }
        }

        if (normalized.isPending || !normalized.status) {
          if (attempt < maxPollAttempts) await new Promise(r => setTimeout(r, pollDelayMs))
          continue
        }

        // Unknown non-pending, non-failed state — keep waiting
        console.warn(`[leonardoProvider] Unknown execution state "${normalized.status}" attempt=${attempt}, waiting`)
        if (attempt < maxPollAttempts) await new Promise(r => setTimeout(r, pollDelayMs))

      } catch (err) {
        const provErr = normalizeError(err)
        if (!provErr.isRetryable) return { status: 'failed', error: provErr }
        console.warn(`[leonardoProvider] Retryable poll error attempt=${attempt}:`, provErr.message)
        if (attempt < maxPollAttempts) await new Promise(r => setTimeout(r, pollDelayMs))
      }
    }

    const maxWaitSec = Math.round((maxPollAttempts * pollDelayMs) / 1000)
    console.warn(`[leonardoProvider] Execution ${executionId} still pending after ${maxPollAttempts} attempts (${maxWaitSec}s)`)
    return {
      status: 'pending',
      error: {
        code:         'timeout',
        message:      `Leonardo generation is still processing after ${maxWaitSec}s. Pump this package again to resume.`,
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

function buildStandaloneTextVariables(input: Leonardo360FrameInput): string {
  const variables = {
    frameIndex: input.frameIndex,
    angleDegrees: input.angleDegrees,
    orbitInstruction: `Render the same product from a ${input.angleDegrees} degree clockwise orbit angle.`,
    lockedScenePrompt: input.lockedScenePrompt,
    productName: input.productName,
    productDescription: input.productDescription ?? '',
    sceneBlueprint: input.sceneBlueprint,
    consistencyRules: [
      'Use the reference image as the visual identity anchor.',
      'Preserve the exact product identity.',
      'Preserve the exact plate, bowl, container, packaging, or vessel.',
      'Preserve the same table surface.',
      'Preserve the same wall and background.',
      'Preserve the same lighting, shadows, highlights, and atmosphere.',
      'Preserve the same camera distance, lens, crop, scale, and composition.',
      'Preserve the same props and object count.',
      'Preserve the same food toppings, ingredients, garnish, sauces, and surface details exactly.',
      'Only rotate the product or viewing angle to the requested angleDegrees.',
      'Do not add new objects.',
      'Do not remove objects.',
      'Do not zoom in or out.',
      'Do not change dish type, ingredients, colors, toppings, garnish, shape, scale, crop, surface, utensils, table, wall, or background.',
    ],
  }

  if (getConfig().textVariablesFormat === 'json') return JSON.stringify(variables)

  return [
    variables.lockedScenePrompt,
    '',
    `Frame index: ${variables.frameIndex}`,
    `Angle degrees: ${variables.angleDegrees}`,
    variables.orbitInstruction,
    '',
    'Consistency rules:',
    ...variables.consistencyRules.map(rule => `- ${rule}`),
  ].join('\n')
}

export async function generateLeonardo360Frame(input: Leonardo360FrameInput): Promise<GeneratedImageResult> {
  const provider = getLeonardoProvider()
  const errors = provider.configErrors()
  if (errors.length > 0) {
    throw new Error(`Missing Leonardo environment variables: ${errors.map(e => e.replace(/^Missing /, '')).join(', ')}. Add them to your server environment and restart the app.`)
  }
  if (!input.referenceImageUrl) {
    throw new Error('Leonardo generation requires a reference image URL.')
  }

  const textVariables = buildStandaloneTextVariables(input)
  const result = await provider.generateFrame({
    prompt: input.lockedScenePrompt,
    angleDegrees: input.angleDegrees,
    frameIndex: input.frameIndex,
    totalFrames: 1,
    width: input.width ?? 1024,
    height: input.height ?? 1024,
    referenceImageUrl: input.referenceImageUrl,
    textVariables,
  })

  if (result.status === 'completed') {
    if (!result.imageUrl && !result.imageBuffer) throw new Error('Leonardo returned completed without an image URL or image buffer.')
    return { provider: 'leonardo', imageUrl: result.imageUrl, imageBuffer: result.imageBuffer, mimeType: result.mimeType, raw: result.rawResponse }
  }

  if (result.status === 'pending' && result.pendingExecutionId && provider.pollExecution) {
    const poll = await provider.pollExecution({ executionId: result.pendingExecutionId })
    if (poll.status === 'completed' && (poll.imageUrl || poll.imageBuffer)) {
      return {
        provider: 'leonardo',
        imageUrl: poll.imageUrl,
        imageBuffer: poll.imageBuffer,
        mimeType: poll.mimeType,
        executionId: result.pendingExecutionId,
      }
    }
    throw new Error(poll.error?.message ?? `Leonardo execution ${result.pendingExecutionId} did not complete with an image.`)
  }

  throw new Error(result.error?.message ?? 'Leonardo did not return an image URL, image buffer, or execution id.')
}

// ─── Legacy compat exports ────────────────────────────────────────────────────

export function normalizeLeonardoResponseShape(raw: unknown): LeonardoNormalizedResponse {
  return normalizeLeonardoResponse(raw)
}
export function extractLeonardoStatus(raw: unknown): string | null {
  return normalizeLeonardoResponse(raw).status
}
export function extractLeonardoFailureMessage(raw: unknown): string | null {
  return normalizeLeonardoResponse(raw).failureMessage
}
export async function pollLeonardoExecution(executionId: string): Promise<PollExecutionResult> {
  return getLeonardoProvider().pollExecution({ executionId })
}
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

// ─── Test helpers (not run in production) ────────────────────────────────────
//
// Export these for manual verification; run with:
//   node -e "require('./leonardoProvider').runNormalizerSelfTest()"

export function runNormalizerSelfTest(): void {
  const tests: Array<{ label: string; input: unknown; expect: Partial<LeonardoNormalizedResponse> }> = [
    {
      label: 'GraphQL error array',
      input: [{ extensions: { code: 'BAD_USER_INPUT' }, locations: [{ line: 1 }], message: 'Variable imageUrl is required.', path: ['blueprintExecutions'] }],
      expect: { isFailed: true, isPending: false, executionId: null, imageUrl: null },
    },
    {
      label: 'Pending execution array',
      input: [{ id: 'exec_123', status: 'PENDING' }],
      expect: { executionId: 'exec_123', isPending: true, isFailed: false },
    },
    {
      label: 'Nested image in data.output.images',
      input: [{ data: { output: { images: [{ url: 'https://example.com/frame.png' }] } } }],
      expect: { imageUrl: 'https://example.com/frame.png', isFailed: false },
    },
    {
      label: 'blueprintExecution object',
      input: { blueprintExecution: { id: 'exec_456', status: 'RUNNING' } },
      expect: { executionId: 'exec_456', isPending: true },
    },
    {
      label: 'outputs array with generated_images',
      input: { outputs: [{ generated_images: [{ url: 'https://example.com/image.png' }] }] },
      expect: { imageUrl: 'https://example.com/image.png' },
    },
    {
      label: 'Array-as-object {"0": {...}}',
      input: { '0': { id: 'abc123', status: 'PENDING' } },
      expect: { executionId: 'abc123', isPending: true },
    },
  ]

  let passed = 0; let failed = 0
  for (const t of tests) {
    const result = normalizeLeonardoResponse(t.input)
    const ok = Object.entries(t.expect).every(([k, v]) => {
      const actual = result[k as keyof LeonardoNormalizedResponse]
      return JSON.stringify(actual) === JSON.stringify(v)
    })
    if (ok) {
      console.info(`  ✓  ${t.label}`)
      passed++
    } else {
      console.error(`  ✗  ${t.label}`)
      console.error('     expected:', t.expect)
      console.error('     got executionId:', result.executionId, 'imageUrl:', result.imageUrl, 'isFailed:', result.isFailed, 'isPending:', result.isPending)
      failed++
    }
  }
  console.info(`\n  ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
