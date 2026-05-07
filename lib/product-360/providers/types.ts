// lib/product-360/providers/types.ts
//
// Clean provider abstraction for the 360 Product Studio.
//
// Legacy exports are kept for backwards compatibility with imagineMidjourney.ts stub.
// Supports both Gemini/Imagen (synchronous) and Leonardo AI (async Blueprint Executions).
//
// SERVER-ONLY. Never import from client components.

// ─── Provider names ───────────────────────────────────────────────────────────

export type Product360ProviderName = 'gemini' | 'leonardo'

// ─── Per-frame generation input ───────────────────────────────────────────────

export interface Generate360FrameInput {
  /** Full per-frame prompt (includes locked scene identity + angle instruction) */
  prompt:          string
  /** Current orbit angle in degrees */
  angleDegrees:    number
  /** 0-based frame index */
  frameIndex:      number
  /** Total frames in this package */
  totalFrames:     number
  width:           number
  height:          number
  /**
   * URL of the owner-uploaded product reference image.
   * Used by Leonardo as the imageUrl blueprint input.
   * Passed to Gemini/Imagen as image-conditioned reference when supported.
   */
  referenceImageUrl?:   string
  /**
   * Base64-encoded master frame (frame 0) for Gemini image-conditioned generation.
   * Only used after frame 0 has been generated successfully.
   */
  referenceImageBase64?:   string
  referenceImageMimeType?: string
  /**
   * Pre-built text variables string for Leonardo blueprint input.
   * Contains locked scene description + current angle info.
   */
  textVariables?:  string
  /**
   * Resume an in-progress async provider execution.
   * When set, the provider polls this job rather than creating a new one.
   */
  pendingExecutionId?: string
}

// ─── Per-frame generation result ─────────────────────────────────────────────

export interface Generate360FrameResult {
  /** Raw image bytes (preferred path) */
  imageBuffer?: Buffer
  /** Remote image URL (provider returned URL, needs downloading) */
  imageUrl?:    string
  mimeType:     string
  provider:     Product360ProviderName
  model?:       string
  /**
   * Async execution ID — set when the provider accepted the request but
   * the image is not yet ready. The pump route must poll on the next call.
   */
  pendingExecutionId?: string
  /**
   * 'completed' = image is ready (imageBuffer or imageUrl is populated)
   * 'pending'   = async job accepted, poll on next pump call
   * 'failed'    = this execution failed
   */
  status: 'completed' | 'pending' | 'failed'
  error?: ProviderError
}

// ─── Polling input / result ───────────────────────────────────────────────────

export interface PollExecutionInput {
  executionId: string
}

export interface PollExecutionResult {
  status:       'pending' | 'completed' | 'failed'
  imageBuffer?: Buffer
  imageUrl?:    string
  mimeType?:    string
  error?:       ProviderError
}

// ─── Structured provider error ────────────────────────────────────────────────

export type ProviderErrorCode =
  | 'auth_failed'
  | 'quota_exceeded'
  | 'moderation'
  | 'invalid_blueprint'
  | 'invalid_api_key'
  | 'missing_env_vars'
  | 'network'
  | 'timeout'
  | 'provider_not_configured'
  | 'unknown'

export interface ProviderError {
  code:           ProviderErrorCode
  message:        string
  details?:       string
  isRetryable:    boolean
  isQuotaError:   boolean
  /** If set, do not retry before this timestamp */
  retryAfterMs?:  number
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface Product360Provider {
  readonly name:    Product360ProviderName
  /** Whether this provider is fully configured (env vars present + valid) */
  isAvailable():    boolean
  /** Diagnostic: list any missing or invalid config */
  configErrors():   string[]
  /**
   * Generate a single frame. May be synchronous (Gemini) or async-start (Leonardo).
   * - If result.status === 'completed': imageBuffer or imageUrl is ready
   * - If result.status === 'pending': pendingExecutionId must be stored; call pollExecution next
   */
  generateFrame(input: Generate360FrameInput): Promise<Generate360FrameResult>
  /**
   * Poll an async execution. Only required for providers that return pending from generateFrame.
   */
  pollExecution?(input: PollExecutionInput): Promise<PollExecutionResult>
}

// ─── Legacy compat (used by imagineMidjourney.ts deprecated stub) ─────────────

/** @deprecated Use Product360Provider from this file instead. */
export interface P360Provider {
  name:        string
  isAvailable: () => boolean
  generate:    (params: {
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    timeoutMs?: number
  }) => Promise<{
    imageUrl?:    string
    imageBuffer?: Buffer
    jobId?:       string
    provider:     string
  }>
}
