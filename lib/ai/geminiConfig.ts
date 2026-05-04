// lib/ai/geminiConfig.ts
// Single source of truth for the Gemini model used by Website AI Autofill.
// Server-side only — never import in client components.

/** Default model for Website AI Autofill. */
export const WEBSITE_AI_GEMINI_MODEL = 'gemini-3-flash-preview' as const

/**
 * Returns the Gemini model to use.
 * Respects the optional WEBSITE_AI_GEMINI_MODEL env override,
 * falling back to the compile-time constant.
 */
export function getWebsiteAiGeminiModel(): string {
  return process.env.WEBSITE_AI_GEMINI_MODEL?.trim() || WEBSITE_AI_GEMINI_MODEL
}
