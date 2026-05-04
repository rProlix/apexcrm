// lib/website-ai/geminiClient.ts
// Server-only Gemini REST client using native fetch.
// Never import this in client components.

import type { GeminiResult } from './types'
import { parseGeminiResult } from './parseGeminiResult'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS      = 90_000

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
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      result:     null,
      rawText:    '',
      tokenUsage: {},
      error:      'Gemini is not configured on the server. Add GEMINI_API_KEY to your environment variables.',
    }
  }

  const url = `${GEMINI_API_BASE}/${getWebsiteAiGeminiModel()}:generateContent?key=${apiKey}`

  const body = {
    contents: [
      {
        parts: [{ text: options.prompt }],
      },
    ],
    generationConfig: {
      temperature:     0.2,
      topK:            40,
      topP:            0.95,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  }

  let response: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      result:     null,
      rawText:    '',
      tokenUsage: {},
      error:      isAbort
        ? 'Gemini took too long to respond. Try a smaller paste.'
        : `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errorText = ''
    try { errorText = await response.text() } catch { /* ignore */ }
    return {
      result:     null,
      rawText:    errorText,
      tokenUsage: {},
      error:      `Gemini API error ${response.status}: ${errorText.slice(0, 200)}`,
    }
  }

  let json: Record<string, unknown>
  try {
    json = await response.json() as Record<string, unknown>
  } catch {
    return {
      result:     null,
      rawText:    '',
      tokenUsage: {},
      error:      'Gemini returned unreadable data. Try again with cleaner text.',
    }
  }

  const tokenUsage = (json.usageMetadata as Record<string, unknown>) ?? {}
  const candidates = json.candidates as Array<Record<string, unknown>> | undefined
  const rawText    = extractText(candidates)

  if (!rawText) {
    return {
      result:     null,
      rawText:    '',
      tokenUsage,
      error:      'No useful content was detected. Try pasting reviews, services, products, hours, or contact info.',
    }
  }

  const { result, error } = parseGeminiResult(rawText)
  return { result, rawText, tokenUsage, error }
}

function extractText(candidates?: Array<Record<string, unknown>>): string {
  if (!candidates?.length) return ''
  const first   = candidates[0]
  const content = first?.content as Record<string, unknown> | undefined
  const parts   = content?.parts as Array<Record<string, unknown>> | undefined
  if (!parts?.length) return ''
  return parts.map((p) => (p?.text as string) ?? '').join('')
}
