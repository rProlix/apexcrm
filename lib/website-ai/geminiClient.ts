// lib/website-ai/geminiClient.ts
// Server-only Gemini client for the AI Website Autofill feature.
// Uses callGeminiText from lib/ai/geminiRequest.ts which never sends
// responseMimeType: 'application/json' — that caused HTTP 400 on gemini-3-flash-preview.
//
// The prompt instructs Gemini to return strict JSON; the response text is
// parsed by parseGeminiResult which handles code fences and minor formatting.

import type { GeminiResult } from './types'
import { parseGeminiResult } from './parseGeminiResult'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { callGeminiText }          from '@/lib/ai/geminiRequest'

export interface GeminiCallOptions {
  prompt: string
}

export interface GeminiCallResult {
  result:     GeminiResult | null
  rawText:    string
  tokenUsage: Record<string, unknown>
  error?:     string
}

export async function callGemini(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const model = getWebsiteAiGeminiModel()

  const { text, tokenUsage, error } = await callGeminiText({
    model,
    prompt:          options.prompt,
    feature:         'website-autofill',
    temperature:     0.2,
    topK:            40,
    topP:            0.95,
    maxOutputTokens: 8192,
    // expectJson is intentionally false here — parseGeminiResult (below) handles
    // code fence stripping and JSON parsing with website-AI-specific validation.
  })

  if (error) {
    return { result: null, rawText: '', tokenUsage: tokenUsage ?? {}, error }
  }

  if (!text) {
    return {
      result:     null,
      rawText:    '',
      tokenUsage: tokenUsage ?? {},
      error:      'No useful content was detected. Try pasting reviews, services, products, hours, or contact info.',
    }
  }

  const { result, error: parseError } = parseGeminiResult(text)
  return { result, rawText: text, tokenUsage: tokenUsage ?? {}, error: parseError }
}
