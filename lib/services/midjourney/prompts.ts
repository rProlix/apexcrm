// lib/services/midjourney/prompts.ts
// Prompt engineering utilities for consistent 360° product spin generation.

import type { AnglePrompt } from '@/types/spin-packages'

/**
 * Generates the locked base prompt that every frame must share.
 * All angle variants are appended to this string so Midjourney keeps
 * the product geometry, lighting, and materials identical across frames.
 */
export function buildBasePrompt(productDescription: string): string {
  return (
    `A ultra-realistic 6K professional studio product photograph of: ${productDescription}. ` +
    `Controlled soft-box studio lighting with gentle rim light, pure neutral seamless background, ` +
    `85mm telephoto lens, f/2.8 shallow depth of field, hyper-detailed surface textures, ` +
    `photorealistic commercial product photography, no shadows, no props, centred subject, ` +
    `fixed tripod, identical exposure settings`
  )
}

/**
 * Builds angle-locked prompt strings for each frame in the spin sequence.
 *
 * Consistency rules injected into every prompt:
 *  - "same product, identical lighting, identical composition"
 *  - explicit camera angle in degrees around the vertical axis
 *  - seed/style lock descriptors
 */
export function buildAnglePrompts(
  productDescription: string,
  imageCount: number,
): AnglePrompt[] {
  const base        = buildBasePrompt(productDescription)
  const angleDelta  = 360 / imageCount
  const prompts: AnglePrompt[] = []

  for (let i = 0; i < imageCount; i++) {
    const angleDeg = Math.round(i * angleDelta)

    const anglePrompt =
      `${base}, ` +
      `camera rotated exactly ${angleDeg} degrees around the vertical axis of the subject, ` +
      `same product, identical lighting setup, identical composition, identical background, ` +
      `identical product geometry, frame ${i + 1} of ${imageCount}, ` +
      `no variation in product identity, no creative reinterpretation, ` +
      `--ar 1:1 --q 2 --style raw --no shadows`

    prompts.push({ frame_index: i, angle_deg: angleDeg, prompt: anglePrompt })
  }

  return prompts
}
