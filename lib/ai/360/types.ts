// lib/ai/360/types.ts
// Core types for the 360 Product Studio AI provider abstraction.
// SERVER-ONLY — never import from client components.

// ─── Provider interface ───────────────────────────────────────────────────────

export interface P360GenerateFrameParams {
  /** Full per-frame prompt (includes angle + product identity) */
  prompt:          string
  negativePrompt?: string
  width?:          number
  height?:         number
  timeoutMs?:      number
  /**
   * Optional base64-encoded master reference image.
   * When provided, passed to the image generation API for image-conditioned
   * generation (visual consistency anchoring across 360° frames).
   */
  referenceImageBase64?:   string
  referenceImageMimeType?: string
}

export interface P360GenerateFrameResult {
  /** Base64-encoded image data (preferred) */
  imageBuffer?: Buffer
  /** Remote URL (if provider returns a URL instead of raw bytes) */
  imageUrl?:    string
  mimeType:     string
  provider:     string
  model:        string
}

export interface P360ImageProvider {
  name:         string
  model:        string
  isAvailable:  () => boolean
  generateFrame: (params: P360GenerateFrameParams) => Promise<P360GenerateFrameResult>
}

// ─── Frame plan ───────────────────────────────────────────────────────────────

export interface P360FramePlan {
  frameIndex:    number
  angleDeg:      number
  shotDirection: string   // e.g. "front", "front-right", "right", …
  turnDirection?: string
  prompt:        string
}

// ─── Product descriptor (built from store product) ────────────────────────────

export interface P360ProductDescriptor {
  name:        string
  description: string
  category?:   string
  /** Raw attributes from the store product (color, material, etc.) */
  attributes?: Record<string, string | number | boolean>
}

// ─── Package generation config ────────────────────────────────────────────────

export interface P360GenerationConfig {
  frameCount:           number
  lightingPreset:       string | null
  backgroundPreset:     string | null
  categoryPreset:       string | null
  cameraPreset:         string | null
  cameraDistance:       number | null
  cameraHeight:         number | null
  fov:                  number | null
  shadowStrength:       number | null
  reflectionIntensity:  number | null
  turnDirection:        'clockwise' | 'counter_clockwise'
  outputWidth:          number | null
  outputHeight:         number | null
  generationNotes:      string | null
  customPrompt:         string | null
}
