// lib/product-360/providers/types.ts
// Provider abstraction for AI image generation.

export interface GenerateImageParams {
  prompt:         string
  negativePrompt?: string
  width?:          number
  height?:         number
  timeoutMs?:      number
}

export interface GenerateImageResult {
  imageUrl?:  string
  imageBuffer?: Buffer
  jobId?:     string
  provider:   string
}

export interface P360Provider {
  name:        string
  isAvailable: () => boolean
  generate:    (params: GenerateImageParams) => Promise<GenerateImageResult>
}
