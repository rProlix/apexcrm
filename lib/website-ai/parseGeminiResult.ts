// lib/website-ai/parseGeminiResult.ts
// Parses and validates the JSON returned by Gemini.

import type { GeminiResult, GeminiSuggestion } from './types'

const AI_SUGGESTION_TYPES = new Set([
  'hero','about','services','products','menu','reviews','testimonials',
  'faq','contact','hours','gallery','policies','social_links','navigation',
  'page','section','seo','promotion','unknown',
])
const AI_ACTIONS = new Set(['create','update','append','replace','ignore'])

export interface ParseResult {
  result: GeminiResult | null
  error?:  string
}

export function parseGeminiResult(rawText: string): ParseResult {
  const cleaned = cleanJsonText(rawText)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Attempt one safe repair
    const repaired = repairJson(cleaned)
    try {
      parsed = JSON.parse(repaired)
    } catch {
      return {
        result: null,
        error:  'Gemini returned unreadable data. Try again with cleaner text.',
      }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { result: null, error: 'Gemini returned an unexpected data shape.' }
  }

  const obj = parsed as Record<string, unknown>

  const suggestions = Array.isArray(obj.suggestions)
    ? (obj.suggestions as unknown[]).map(normalizeSuggestion).filter(Boolean) as GeminiSuggestion[]
    : []

  const result: GeminiResult = {
    summary:              asString(obj.summary, 'Content analyzed'),
    detectedBusinessType: asBusinessType(obj.detectedBusinessType),
    detectedContentTypes: asStringArray(obj.detectedContentTypes),
    overallConfidence:    asNumber(obj.overallConfidence, 0),
    designSystem:         asObject(obj.designSystem) ?? undefined,
    suggestions,
    warnings:             asStringArray(obj.warnings),
    missingInfoQuestions: asStringArray(obj.missingInfoQuestions),
  }

  if (result.suggestions.length === 0 && result.warnings.length === 0) {
    return {
      result,
      error: 'No website-ready content was detected. Try pasting reviews, services, products, hours, or contact info.',
    }
  }

  return { result }
}

function cleanJsonText(text: string): string {
  let t = text.trim()
  // Strip markdown code fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  // Strip leading/trailing non-JSON characters
  const first = t.indexOf('{')
  const last  = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1)
  }
  return t
}

function repairJson(text: string): string {
  let t = text
  // Remove trailing commas before } or ]
  t = t.replace(/,\s*([\]}])/g, '$1')
  // Remove JS comments
  t = t.replace(/\/\/[^\n]*/g, '')
  t = t.replace(/\/\*[\s\S]*?\*\//g, '')
  return t
}

function normalizeSuggestion(raw: unknown): GeminiSuggestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>

  const type   = asString(s.type, 'unknown')
  const action = asString(s.action, 'create')

  return {
    type:            AI_SUGGESTION_TYPES.has(type) ? (type as GeminiSuggestion['type']) : 'unknown',
    action:          AI_ACTIONS.has(action) ? (action as GeminiSuggestion['action']) : 'create',
    confidence:      asNumber(s.confidence, 0.5),
    title:           asString(s.title, 'Untitled'),
    reason:          asString(s.reason, ''),
    target:          asTarget(s.target),
    data:            asObject(s.data),
    proposedSection: asProposedSection(s.proposedSection),
  }
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

function asTarget(v: unknown): GeminiSuggestion['target'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const t = v as Record<string, unknown>
  return {
    pageSlug:    typeof t.pageSlug === 'string'    ? t.pageSlug    : undefined,
    sectionType: typeof t.sectionType === 'string' ? t.sectionType : undefined,
  }
}

function asProposedSection(v: unknown): GeminiSuggestion['proposedSection'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { type: 'custom' }
  }
  return v as GeminiSuggestion['proposedSection']
}

function asBusinessType(v: unknown): GeminiResult['detectedBusinessType'] {
  const valid = new Set([
    'car_rental','salon','plumber','restaurant','ecommerce',
    'contractor','auto_shop','medical','fitness','unknown',
  ])
  const s = typeof v === 'string' ? v : ''
  return valid.has(s) ? (s as GeminiResult['detectedBusinessType']) : 'unknown'
}
