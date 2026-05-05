// lib/ai/assertNoUnsupportedImagenFields.ts
// Runtime regression guard: throws before the HTTP request leaves the server
// if an Imagen payload still contains a negativePrompt field.
//
// Called by imagenGenerate.ts immediately before fetch().
// Ensures no future refactor accidentally re-introduces the banned fields.

const BANNED_KEYS = [
  'negativePrompt',
  'negative_prompt',
  'negativePrompts',
  'negative_prompts',
]

/**
 * Throws if `payload` (serialized to JSON) contains any banned Imagen field.
 *
 * @throws Error with a clear message naming the offending key.
 */
export function assertNoUnsupportedImagenFields(payload: unknown): void {
  const text = JSON.stringify(payload)

  for (const key of BANNED_KEYS) {
    // Check for both `"key":` (object key) to avoid false positives in prompt text
    if (text.includes(`"${key}"`)) {
      throw new Error(
        `Imagen payload contains unsupported field "${key}". ` +
        `Imagen no longer accepts negativePrompt. ` +
        `Use mergeNegativePromptIntoPrompt() from lib/ai/promptSafety.ts to ` +
        `fold constraints into the positive prompt before building the payload.`,
      )
    }
  }
}
