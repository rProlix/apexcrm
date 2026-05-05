// lib/ai/geminiText.ts
// Text-only Gemini calls for AI planning tasks (360 frame planning, descriptions, etc.)
//
// This module is ONLY for TEXT generation. It must NEVER be used for image generation.
// For image generation, use lib/ai/imagenGenerate.ts or lib/ai/360/imagenProvider.ts.
//
// The 360 Product Studio uses this for:
//   - Generating structured frame descriptions
//   - AI-enhanced product photography prompts
//   - Frame plan JSON (parsed from plain text)
//
// Default model: gemini-2.5-flash-lite (fast, cost-effective for planning)
// The website autofill feature continues to use gemini-3-flash-preview (see geminiRequest.ts)
//
// SERVER-ONLY. Never import from client components.

import { callGeminiText, type GeminiTextRequestOptions, type GeminiTextResult } from './geminiRequest'
import { safeParseGeminiJson } from './parseGeminiJson'

const DEFAULT_360_PLANNING_MODEL = 'gemini-2.5-flash-lite'

export type { GeminiTextRequestOptions, GeminiTextResult }

// ─── 360-scoped text generation ───────────────────────────────────────────────

export interface P360TextOptions {
  prompt:          string
  feature?:        string
  temperature?:    number
  maxOutputTokens?: number
  timeoutMs?:      number
}

export interface P360TextResult<T = string> {
  text:       string
  data:       T | null
  parseError?: string
  error?:     string
}

/**
 * Generate plain text from Gemini for 360 planning tasks.
 * Uses gemini-2.5-flash-lite by default.
 * Can be overridden via GEMINI_360_PLANNER_MODEL env var.
 *
 * @example
 *   const { text, error } = await plan360Text({ prompt: '...' })
 */
export async function plan360Text(opts: P360TextOptions): Promise<P360TextResult<string>> {
  const model = (process.env.GEMINI_360_PLANNER_MODEL ?? DEFAULT_360_PLANNING_MODEL).trim()
  const result = await callGeminiText({
    model,
    prompt:          opts.prompt,
    feature:         opts.feature ?? '360-planning',
    temperature:     opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
    timeoutMs:       opts.timeoutMs ?? 30_000,
  })
  return {
    text:       result.text,
    data:       result.text || null,
    error:      result.error,
    parseError: undefined,
  }
}

/**
 * Generate and parse a JSON structure from Gemini for 360 planning tasks.
 * Prompts Gemini to return strict JSON in plain text, then parses it safely.
 * Uses gemini-2.5-flash-lite by default.
 *
 * @example
 *   interface FramePlanJSON { frames: Array<{ angle: number; prompt: string }> }
 *   const { data, error } = await plan360Json<FramePlanJSON>({ prompt: '...' })
 */
export async function plan360Json<T = unknown>(opts: P360TextOptions): Promise<P360TextResult<T>> {
  const model = (process.env.GEMINI_360_PLANNER_MODEL ?? DEFAULT_360_PLANNING_MODEL).trim()
  const result = await callGeminiText<T>({
    model,
    prompt:          opts.prompt,
    feature:         opts.feature ?? '360-json-planning',
    temperature:     opts.temperature ?? 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    expectJson:      true,
    timeoutMs:       opts.timeoutMs ?? 30_000,
  })
  return {
    text:       result.text,
    data:       result.data,
    error:      result.error,
    parseError: result.parseError,
  }
}

/**
 * Build an AI-enhanced product photography prompt for a specific rotation angle.
 * Useful for enriching template-based prompts with product-specific details.
 *
 * Returns the enhanced prompt as a plain string.
 * Falls back to the original prompt if Gemini fails.
 */
export async function enhanceFramePrompt(
  originalPrompt: string,
  productName:    string,
): Promise<string> {
  const prompt = `You are a professional product photography prompt engineer.
Rewrite the following 360° product photography prompt to be more vivid and photorealistic.
Keep all the rotation angle, lighting, background, and style requirements exactly the same.
Only enhance the descriptive language for the product appearance.
Return ONLY the improved prompt text — no explanation, no markdown, no quotes.

Product name: ${productName}

Original prompt:
${originalPrompt}`

  const { text, error } = await plan360Text({
    prompt,
    feature:     '360-prompt-enhance',
    temperature: 0.4,
  })

  if (error || !text.trim()) return originalPrompt
  return text.trim()
}

// ─── Re-export for convenience ────────────────────────────────────────────────

export { callGeminiText, safeParseGeminiJson }
