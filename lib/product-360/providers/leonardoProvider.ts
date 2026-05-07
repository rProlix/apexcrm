// lib/product-360/providers/leonardoProvider.ts
//
// Leonardo AI provider via Blueprint Executions.
//
// Flow for each frame:
//   1. generateFrame() → POST /blueprint-executions → returns pendingExecutionId
//   2. pollExecution() → GET /blueprint-executions/{id}/generations → returns image URL when done
//
// The pump route stores pendingExecutionId on product_360_frames.provider_job_id and
// calls pollExecution() on the next pump invocation until status = completed.
//
// Configuration (env vars — all server-side only):
//   LEONARDO_API_KEY                        Required
//   LEONARDO_360_BLUEPRINT_VERSION_ID       Required
//   LEONARDO_360_REFERENCE_IMAGE_NODE_ID    Required (nodeId for imageUrl input)
//   LEONARDO_360_TEXT_VARIABLES_NODE_ID     Required (nodeId for textVariables input)
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

const LEONARDO_API_BASE   = 'https://cloud.leonardo.ai/api/rest/v1'
const DEFAULT_POLL_TIMEOUT = 90_000   // ms — max time to wait in a single pollExecution call

// ─── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    apiKey:               process.env.LEONARDO_API_KEY?.trim()                        ?? '',
    blueprintVersionId:   process.env.LEONARDO_360_BLUEPRINT_VERSION_ID?.trim()       ?? '',
    referenceImageNodeId: process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID?.trim()    ?? '',
    textVariablesNodeId:  process.env.LEONARDO_360_TEXT_VARIABLES_NODE_ID?.trim()     ?? '',
  }
}

// ─── Error normalizer ─────────────────────────────────────────────────────────

function normalizeError(err: unknown, httpStatus?: number): ProviderError {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (httpStatus === 401 || httpStatus === 403 || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return { code: 'auth_failed',        message: msg, isRetryable: false, isQuotaError: false }
  }
  if (httpStatus === 429 || lower.includes('429') || lower.includes('quota') || lower.includes('rate limit')) {
    return { code: 'quota_exceeded',     message: msg, isRetryable: true,  isQuotaError: true }
  }
  if (lower.includes('moderat') || lower.includes('nsfw') || lower.includes('content policy')) {
    return { code: 'moderation',         message: msg, isRetryable: false, isQuotaError: false }
  }
  if (lower.includes('blueprint') || lower.includes('invalid') || httpStatus === 400) {
    return { code: 'invalid_blueprint',  message: msg, isRetryable: false, isQuotaError: false }
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return { code: 'timeout',            message: msg, isRetryable: true,  isQuotaError: false }
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch')) {
    return { code: 'network',            message: msg, isRetryable: true,  isQuotaError: false }
  }
  return { code: 'unknown', message: msg, isRetryable: true, isQuotaError: false }
}

// ─── Leonardo API helpers ─────────────────────────────────────────────────────

async function createBlueprintExecution(
  apiKey:               string,
  blueprintVersionId:   string,
  referenceImageNodeId: string,
  textVariablesNodeId:  string,
  referenceImageUrl:    string,
  textVariables:        string,
): Promise<{ executionId: string }> {
  const url = `${LEONARDO_API_BASE}/blueprint-executions`

  const nodeInputs = []

  if (referenceImageNodeId && referenceImageUrl) {
    nodeInputs.push({
      nodeId:      referenceImageNodeId,
      value:       referenceImageUrl,
      settingName: 'imageUrl',
    })
  }

  if (textVariablesNodeId && textVariables) {
    nodeInputs.push({
      nodeId:      textVariablesNodeId,
      value:       textVariables,
      settingName: 'textVariables',
    })
  }

  const body = {
    blueprintVersionId,
    input: {
      nodeInputs,
      public: false,
    },
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'accept':        'application/json',
      'authorization': `Bearer ${apiKey}`,
      'content-type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errText = ''
    try { errText = await res.text() } catch { /* ignore */ }
    const err = normalizeError(new Error(`HTTP ${res.status}: ${errText.slice(0, 400)}`), res.status)
    throw Object.assign(new Error(err.message), { providerError: err })
  }

  const json = await res.json() as {
    blueprintExecutionJob?: { id?: string }
    error?: string
    message?: string
  }

  const executionId = json?.blueprintExecutionJob?.id
  if (!executionId) {
    throw new Error(`Leonardo blueprint execution created but no ID returned. Response: ${JSON.stringify(json).slice(0, 300)}`)
  }

  return { executionId }
}

// ─── Poll blueprint execution for completed images ────────────────────────────

type LeonardoGenerationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | string

interface LeonardoGenerationsResponse {
  blueprintExecutionGenerations?: {
    status?: LeonardoGenerationStatus
    generations?: Array<{
      id?: string
      status?: string
      generated_images?: Array<{
        id?:  string
        url?: string
      }>
    }>
  }
  error?:   string
  message?: string
}

async function pollBlueprintGenerations(
  apiKey:      string,
  executionId: string,
): Promise<{ status: LeonardoGenerationStatus; imageUrl?: string }> {
  const url = `${LEONARDO_API_BASE}/blueprint-executions/${encodeURIComponent(executionId)}/generations`

  const res = await fetch(url, {
    method:  'GET',
    headers: {
      'accept':        'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
  })

  if (!res.ok) {
    let errText = ''
    try { errText = await res.text() } catch { /* ignore */ }
    throw new Error(`Leonardo poll HTTP ${res.status}: ${errText.slice(0, 300)}`)
  }

  const json = await res.json() as LeonardoGenerationsResponse

  const execGen   = json.blueprintExecutionGenerations
  const rawStatus = execGen?.status ?? 'PENDING'
  const status: LeonardoGenerationStatus =
    ['PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED'].includes(rawStatus)
      ? rawStatus
      : 'PENDING'

  if (status === 'COMPLETE') {
    // Extract the first image URL from the first generation
    const gens    = execGen?.generations ?? []
    const images  = gens[0]?.generated_images ?? []
    const imageUrl = images[0]?.url
    return { status: 'COMPLETE', imageUrl }
  }

  if (status === 'FAILED') {
    const errMsg = json.error ?? json.message ?? 'Leonardo generation failed'
    throw new Error(`Leonardo execution failed: ${errMsg}`)
  }

  return { status }
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
    const cfg = getConfig()
    const errors = this.configErrors()
    if (errors.length > 0) {
      return {
        status:   'failed',
        mimeType: 'image/png',
        provider: 'leonardo',
        error: {
          code:         'missing_env_vars',
          message:      errors.join('; '),
          isRetryable:  false,
          isQuotaError: false,
        },
      }
    }

    // Leonardo requires a reference image URL for Blueprint Executions
    // Fall back to a generic instruction if not provided
    const refImageUrl   = input.referenceImageUrl ?? ''
    const textVariables = input.textVariables ?? input.prompt

    if (!refImageUrl) {
      console.warn(
        '[leonardoProvider] No reference image URL provided for Leonardo Blueprint Execution. ' +
        'Results may be less consistent. Upload a reference image via /upload-reference first.',
      )
    }

    try {
      console.info(
        `[leonardoProvider] Creating blueprint execution ` +
        `frame=${input.frameIndex} angle=${input.angleDegrees}° ` +
        `blueprintVersionId=${cfg.blueprintVersionId.slice(0, 8)}… ` +
        `hasReferenceImage=${!!refImageUrl}`,
      )

      const { executionId } = await createBlueprintExecution(
        cfg.apiKey,
        cfg.blueprintVersionId,
        cfg.referenceImageNodeId,
        cfg.textVariablesNodeId,
        refImageUrl,
        textVariables,
      )

      console.info(`[leonardoProvider] Execution created: ${executionId} — returning pending`)

      return {
        status:              'pending',
        mimeType:            'image/png',
        provider:            'leonardo',
        pendingExecutionId:  executionId,
      }
    } catch (err) {
      // Check if it's a provider error already attached
      const provErr = (err as { providerError?: ProviderError }).providerError
      return {
        status:   'failed',
        mimeType: 'image/png',
        provider: 'leonardo',
        error:    provErr ?? normalizeError(err),
      }
    }
  }

  async pollExecution(input: PollExecutionInput): Promise<PollExecutionResult> {
    const cfg = getConfig()
    if (!cfg.apiKey) {
      return {
        status: 'failed',
        error: {
          code:         'missing_env_vars',
          message:      'LEONARDO_API_KEY is not set',
          isRetryable:  false,
          isQuotaError: false,
        },
      }
    }

    const startMs = Date.now()

    // Poll in a loop with back-off until timeout
    while (Date.now() - startMs < DEFAULT_POLL_TIMEOUT) {
      try {
        const { status, imageUrl } = await pollBlueprintGenerations(cfg.apiKey, input.executionId)

        if (status === 'COMPLETE') {
          if (!imageUrl) {
            return {
              status: 'failed',
              error: {
                code:         'unknown',
                message:      'Leonardo execution COMPLETE but no image URL returned',
                isRetryable:  false,
                isQuotaError: false,
              },
            }
          }

          // Download the image
          let imageBuffer: Buffer | undefined
          let mimeType = 'image/png'
          try {
            const imgRes = await fetch(imageUrl)
            if (!imgRes.ok) throw new Error(`Image download HTTP ${imgRes.status}`)
            imageBuffer = Buffer.from(await imgRes.arrayBuffer())
            mimeType    = imgRes.headers.get('content-type') ?? 'image/png'
          } catch (dlErr) {
            console.warn(`[leonardoProvider] Image download failed, returning URL instead: ${dlErr}`)
          }

          console.info(`[leonardoProvider] Execution ${input.executionId} complete — image ready`)

          return {
            status:      'completed',
            imageBuffer,
            imageUrl:    imageBuffer ? undefined : imageUrl,
            mimeType,
          }
        }

        if (status === 'FAILED') {
          return {
            status: 'failed',
            error: {
              code:         'unknown',
              message:      `Leonardo execution ${input.executionId} failed`,
              isRetryable:  false,
              isQuotaError: false,
            },
          }
        }

        // Still PENDING / IN_PROGRESS — wait and retry
        console.info(`[leonardoProvider] Execution ${input.executionId} status=${status} — waiting 4s`)
        await new Promise(r => setTimeout(r, 4000))

      } catch (err) {
        const provErr = normalizeError(err)
        if (!provErr.isRetryable) {
          return { status: 'failed', error: provErr }
        }
        // Transient error — wait and retry
        await new Promise(r => setTimeout(r, 4000))
      }
    }

    // Timed out within this poll call — caller should try again on next pump
    console.warn(`[leonardoProvider] pollExecution timed out after ${DEFAULT_POLL_TIMEOUT}ms — will retry on next pump call`)
    return {
      status: 'pending',
      error: {
        code:         'timeout',
        message:      'Leonardo execution still in progress (poll timed out). Will retry.',
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
