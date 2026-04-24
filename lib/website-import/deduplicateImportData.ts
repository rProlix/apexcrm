// lib/website-import/deduplicateImportData.ts
// Merges ExtractedBusinessFields from multiple sources into one canonical set.
// For each field, the highest-confidence value wins; arrays are merged/deduped.

import type {
  ExtractedBusinessFields,
  ScoredValue,
  StructuredAddress,
  StructuredReview,
} from './types'

type AnyScored = ScoredValue<unknown>

/**
 * Pick the highest-confidence value from a list of scored values.
 */
function bestOf<T>(values: Array<ScoredValue<T> | null>): ScoredValue<T> | null {
  const nonNull = values.filter((v): v is ScoredValue<T> => v !== null)
  if (nonNull.length === 0) return null
  return nonNull.reduce((best, cur) =>
    cur.confidence > best.confidence ? cur : best,
  )
}

/**
 * Merge string arrays from multiple sources, deduplicating case-insensitively.
 */
function mergeStringArrays(
  values: Array<ScoredValue<string[]> | null>,
): ScoredValue<string[]> | null {
  const nonNull = values.filter((v): v is ScoredValue<string[]> => v !== null)
  if (nonNull.length === 0) return null

  const seen = new Set<string>()
  const merged: string[] = []

  // Sort by confidence descending so highest-confidence items appear first
  const sorted = [...nonNull].sort((a, b) => b.confidence - a.confidence)
  for (const scored of sorted) {
    for (const item of scored.value) {
      const key = item.toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }
  }

  const avgConfidence =
    sorted.reduce((sum, s) => sum + s.confidence, 0) / sorted.length

  return {
    value:      merged,
    confidence: parseFloat(Math.min(1, avgConfidence + 0.05).toFixed(2)),
    sourceUrl:  sorted[0].sourceUrl,
    sourceType: sorted[0].sourceType,
  }
}

/**
 * Merge social link maps, preferring higher-confidence sources per platform.
 */
function mergeSocialLinks(
  values: Array<ScoredValue<Record<string, string>> | null>,
): ScoredValue<Record<string, string>> | null {
  const nonNull = values.filter(
    (v): v is ScoredValue<Record<string, string>> => v !== null,
  )
  if (nonNull.length === 0) return null

  const sorted = [...nonNull].sort((a, b) => b.confidence - a.confidence)
  const merged: Record<string, string> = {}

  for (const scored of sorted) {
    for (const [platform, url] of Object.entries(scored.value)) {
      if (!merged[platform]) merged[platform] = url
    }
  }

  return {
    value:      merged,
    confidence: sorted[0].confidence,
    sourceUrl:  sorted[0].sourceUrl,
    sourceType: sorted[0].sourceType,
  }
}

/**
 * Merge reviews/testimonials, deduplicating by author+text.
 */
function mergeReviews(
  values: Array<ScoredValue<StructuredReview[]> | null>,
): ScoredValue<StructuredReview[]> | null {
  const nonNull = values.filter(
    (v): v is ScoredValue<StructuredReview[]> => v !== null,
  )
  if (nonNull.length === 0) return null

  const seen = new Set<string>()
  const merged: StructuredReview[] = []

  for (const scored of nonNull) {
    for (const review of scored.value) {
      const key = `${review.author}::${review.text.slice(0, 40)}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(review)
      }
    }
  }

  return {
    value:      merged,
    confidence: Math.max(...nonNull.map((v) => v.confidence)),
    sourceUrl:  nonNull[0].sourceUrl,
    sourceType: nonNull[0].sourceType,
  }
}

/**
 * Merge FAQ items, deduplicating by question text.
 */
function mergeFaq(
  values: Array<ScoredValue<Array<{ question: string; answer: string }>> | null>,
): ScoredValue<Array<{ question: string; answer: string }>> | null {
  const nonNull = values.filter(
    (v): v is ScoredValue<Array<{ question: string; answer: string }>> => v !== null,
  )
  if (nonNull.length === 0) return null

  const seen = new Set<string>()
  const merged: Array<{ question: string; answer: string }> = []

  for (const scored of nonNull) {
    for (const item of scored.value) {
      const key = item.question.toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }
  }

  return {
    value:      merged,
    confidence: Math.max(...nonNull.map((v) => v.confidence)),
    sourceUrl:  nonNull[0].sourceUrl,
    sourceType: nonNull[0].sourceType,
  }
}

/**
 * Merge image arrays from multiple sources, deduplicating by src URL.
 */
function mergeImages(
  values: Array<ScoredValue<Array<{ src: string; alt: string }>> | null>,
): ScoredValue<Array<{ src: string; alt: string }>> | null {
  const nonNull = values.filter(
    (v): v is ScoredValue<Array<{ src: string; alt: string }>> => v !== null,
  )
  if (nonNull.length === 0) return null

  const seen = new Set<string>()
  const merged: Array<{ src: string; alt: string }> = []

  for (const scored of nonNull) {
    for (const img of scored.value) {
      if (!seen.has(img.src)) {
        seen.add(img.src)
        merged.push(img)
      }
    }
  }

  return {
    value:      merged.slice(0, 20),
    confidence: nonNull[0].confidence,
    sourceUrl:  nonNull[0].sourceUrl,
    sourceType: nonNull[0].sourceType,
  }
}

/**
 * Merge service strings from multiple sources.
 */
function mergeServices(
  values: Array<ScoredValue<string[]> | null>,
): ScoredValue<Array<{ title: string; description: string }>> | null {
  const merged = mergeStringArrays(values)
  if (!merged) return null
  return {
    value:      merged.value.map((s) => ({ title: s, description: '' })),
    confidence: merged.confidence,
    sourceUrl:  merged.sourceUrl,
    sourceType: merged.sourceType,
  } as unknown as ScoredValue<Array<{ title: string; description: string }>>
}

// ── Main merge function ────────────────────────────────────────────────────────

/**
 * Deduplicate and merge ExtractedBusinessFields from multiple source pages.
 * Returns a single merged ExtractedBusinessFields.
 */
export function deduplicateImportData(
  sources: ExtractedBusinessFields[],
): ExtractedBusinessFields {
  if (sources.length === 0) {
    return emptyFields()
  }
  if (sources.length === 1) return sources[0]

  return {
    businessName:   bestOf(sources.map((s) => s.businessName)) as ScoredValue | null,
    tagline:        bestOf(sources.map((s) => s.tagline)) as ScoredValue | null,
    description:    bestOf(sources.map((s) => s.description)) as ScoredValue | null,
    logoUrl:        bestOf(sources.map((s) => s.logoUrl)) as ScoredValue | null,
    faviconUrl:     bestOf(sources.map((s) => s.faviconUrl)) as ScoredValue | null,
    phone:          bestOf(sources.map((s) => s.phone)) as ScoredValue | null,
    email:          bestOf(sources.map((s) => s.email)) as ScoredValue | null,
    address:        bestOf(sources.map((s) => s.address as AnyScored | null)) as ScoredValue<StructuredAddress | string> | null,
    hours:          mergeStringArrays(sources.map((s) => s.hours)) as ScoredValue<string[]> | null,
    socialLinks:    mergeSocialLinks(sources.map((s) => s.socialLinks)),
    services:       mergeServices(sources.map((s) => s.services)) as unknown as ScoredValue<string[]> | null,
    products:       null,
    testimonials:   mergeReviews(sources.map((s) => s.testimonials)),
    faqItems:       mergeFaq(sources.map((s) => s.faqItems)),
    images:         mergeImages(sources.map((s) => s.images)),
    brandColors:    bestOf(sources.map((s) => s.brandColors as AnyScored | null)) as ScoredValue<{ primary: string; accent?: string }> | null,
    seoTitle:       bestOf(sources.map((s) => s.seoTitle)) as ScoredValue | null,
    seoDescription: bestOf(sources.map((s) => s.seoDescription)) as ScoredValue | null,
    mapUrl:         bestOf(sources.map((s) => s.mapUrl)) as ScoredValue | null,
    latitude:       bestOf(sources.map((s) => s.latitude as AnyScored | null)) as ScoredValue<number> | null,
    longitude:      bestOf(sources.map((s) => s.longitude as AnyScored | null)) as ScoredValue<number> | null,
    priceRange:     bestOf(sources.map((s) => s.priceRange)) as ScoredValue | null,
  }
}

function emptyFields(): ExtractedBusinessFields {
  return {
    businessName: null, tagline: null, description: null,
    logoUrl: null, faviconUrl: null, phone: null, email: null,
    address: null, hours: null, socialLinks: null, services: null,
    products: null, testimonials: null, faqItems: null, images: null,
    brandColors: null, seoTitle: null, seoDescription: null,
    mapUrl: null, latitude: null, longitude: null, priceRange: null,
  }
}
