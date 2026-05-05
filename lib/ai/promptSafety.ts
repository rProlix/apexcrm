// lib/ai/promptSafety.ts
// Utilities for building safe, complete prompts for Imagen and other image models
// that no longer support a separate negativePrompt field.
//
// Imagen 4 removed negativePrompt support — passing the field causes HTTP 400
// INVALID_ARGUMENT "Setting negativePrompt is no longer supported."
//
// The correct approach: fold negative instructions into the positive prompt text.

/**
 * Merges negative instructions into the positive prompt so Imagen receives a
 * single, self-contained prompt string that implicitly avoids unwanted content.
 *
 * If negativePrompt is empty/null the original prompt is returned unchanged.
 *
 * @example
 *   mergeNegativePromptIntoPrompt(
 *     'Ultra-realistic photo of a black coffee mug on marble.',
 *     'no text, no hands, no blurry details'
 *   )
 *   // → "Ultra-realistic photo of a black coffee mug on marble.
 *   //
 *   //    Quality and accuracy constraints:
 *   //    Avoid the following by describing the scene cleanly instead: no text, no hands, no blurry details.
 *   //    Do not include text, watermarks, logos, distorted objects, ..."
 */
export function mergeNegativePromptIntoPrompt(
  prompt:          string,
  negativePrompt?: string | null,
): string {
  const cleanPrompt   = String(prompt          ?? '').trim()
  const cleanNegative = String(negativePrompt  ?? '').trim()

  if (!cleanNegative) return cleanPrompt

  return [
    cleanPrompt,
    '',
    'Quality and accuracy constraints:',
    `Avoid the following by describing the scene cleanly instead: ${cleanNegative}.`,
    'Do not include text, watermarks, logos, distorted objects, duplicate products, ' +
    'extra hands, extra props, warped geometry, blurry details, or inconsistent ' +
    'lighting unless explicitly requested.',
  ].join('\n')
}

/**
 * Strips negativePrompt (and all known aliases) from any Imagen request payload
 * object, recursively. Used as a final defensive pass before fetch.
 *
 * This guarantees that even if a caller accidentally passes one of the
 * unsupported fields, it is removed before the HTTP request leaves the server.
 */
export function stripUnsupportedImagenFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedImagenFields)
  }

  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === 'negativePrompt'  ||
        key === 'negative_prompt' ||
        key === 'negativePrompts' ||
        key === 'negative_prompts'
      ) {
        continue
      }
      cleaned[key] = stripUnsupportedImagenFields(nested)
    }
    return cleaned
  }

  return value
}

// ─── Strict Imagen payload type (no negativePrompt) ───────────────────────────

export interface ImagenRequestPayload {
  instances: Array<{ prompt: string }>
  parameters?: {
    sampleCount?:     number
    aspectRatio?:     string
    outputOptions?:   { mimeType?: 'image/png' | 'image/jpeg' }
    personGeneration?: string
  }
}
