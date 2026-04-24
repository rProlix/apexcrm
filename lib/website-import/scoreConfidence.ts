// lib/website-import/scoreConfidence.ts
// Assigns confidence scores (0–1) to extracted fields.
// Higher confidence = more reliable source or more corroborating signals.

import type { SourceType } from './types'

/**
 * Source-type base trust weights.
 * Official structured data (schema.org) is highest trust.
 * Directory profiles are medium. Plain DOM text is lowest.
 */
const SOURCE_WEIGHTS: Record<SourceType | 'structured_data' | 'metadata', number> = {
  structured_data: 0.95,
  metadata:        0.80,
  website:         0.70,
  yelp:            0.75,
  business_profile: 0.65,
  manual:          0.60,
}

export interface ScoreInput {
  value:      unknown
  sourceType: SourceType
  fieldKey:   string
  /** True if the same value was found in multiple independent sources */
  corroborated?: boolean
  /** True if this came from JSON-LD structured data */
  fromStructuredData?: boolean
  /** True if this came from <meta> / OG tags */
  fromMetadata?: boolean
}

/**
 * Returns a 0–1 confidence score for a single extracted value.
 */
export function scoreField(input: ScoreInput): number {
  let base = SOURCE_WEIGHTS[input.sourceType] ?? 0.50

  if (input.fromStructuredData) base = SOURCE_WEIGHTS.structured_data
  else if (input.fromMetadata) base = SOURCE_WEIGHTS.metadata

  // Boost for corroboration across sources
  if (input.corroborated) base = Math.min(1, base + 0.10)

  // Field-specific penalties for values that feel generic/default
  base *= getFieldQualityFactor(input.fieldKey, input.value)

  return parseFloat(base.toFixed(2))
}

function getFieldQualityFactor(key: string, value: unknown): number {
  if (!value) return 0.1

  const str = typeof value === 'string' ? value : JSON.stringify(value)

  switch (key) {
    case 'businessName': {
      if (str.length < 2) return 0.1
      if (str.toLowerCase().includes('untitled')) return 0.3
      if (str.length > 60) return 0.7
      return 1.0
    }
    case 'phone': {
      const digits = str.replace(/\D/g, '')
      if (digits.length < 10) return 0.3
      return 1.0
    }
    case 'email': {
      if (!str.includes('@')) return 0.1
      if (str.includes('example.com') || str.includes('noreply')) return 0.2
      return 1.0
    }
    case 'logoUrl':
    case 'faviconUrl': {
      if (str.includes('favicon.ico')) return 0.6
      if (str.match(/\.(png|jpg|jpeg|svg|webp)/i)) return 1.0
      return 0.7
    }
    case 'description': {
      if (str.length < 30) return 0.4
      if (str.length > 100) return 1.0
      return 0.8
    }
    case 'hours': {
      if (Array.isArray(value) && value.length === 0) return 0.1
      return 1.0
    }
    case 'services':
    case 'testimonials':
    case 'faqItems': {
      if (Array.isArray(value)) {
        if (value.length === 0) return 0.1
        if (value.length >= 3) return 1.0
        return 0.7
      }
      return 0.5
    }
    default:
      return 1.0
  }
}

/**
 * Build a confidence map for all fields in a normalized content object.
 */
export function buildConfidenceMap(
  fields: Record<string, unknown>,
  defaultSourceType: SourceType = 'website',
): Record<string, number> {
  const map: Record<string, number> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (key === 'confidenceMap') continue
    map[key] = scoreField({
      value,
      sourceType: defaultSourceType,
      fieldKey:   key,
    })
  }

  return map
}
