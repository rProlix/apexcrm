export type CanonicalImageView =
  | 'front'
  | 'rear'
  | 'driver_side'
  | 'passenger_side'
  | 'interior'
  | 'odometer'
  | 'dashboard'
  | 'unknown'

export interface ComparableImage {
  id: string
  view: CanonicalImageView
  quality: 'acceptable' | 'low_quality' | 'unknown'
  identityConfidence?: number | null
}

export interface ComparableInspection {
  id: string
  tenantId: string
  vanId: string | null
  inspectedAt: string
  inspectionType: string
  status: string
  reviewStatus: string
  deletedAt?: string | null
  wrongVan?: boolean
  invalidDuplicate?: boolean
  images: ComparableImage[]
}

export interface ComparisonPair {
  currentImageId: string
  priorImageId: string
  canonicalView: CanonicalImageView
  comparability: 'highly_comparable' | 'comparable' | 'low_confidence'
}

export function findComparablePriorInspection(input: {
  tenantId: string
  vanId: string
  currentInspectionId: string
  currentTimestamp: string
  currentImages: ComparableImage[]
  candidates: ComparableInspection[]
}): { inspection: ComparableInspection; pairs: ComparisonPair[] } | null {
  const eligible = input.candidates
    .filter(
      (candidate) =>
        candidate.id !== input.currentInspectionId &&
        candidate.tenantId === input.tenantId &&
        candidate.vanId === input.vanId &&
        candidate.inspectedAt < input.currentTimestamp &&
        !candidate.deletedAt &&
        !candidate.wrongVan &&
        !candidate.invalidDuplicate &&
        ['completed', 'needs_review'].includes(candidate.status) &&
        candidate.reviewStatus !== 'dismissed'
    )
    .sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt))

  for (const candidate of eligible) {
    const pairs = input.currentImages.flatMap((current) => {
      if (current.view === 'unknown' || current.quality === 'low_quality') return []
      const prior = candidate.images.find(
        (image) => image.view === current.view && image.quality !== 'low_quality'
      )
      if (!prior) return []
      const confidence = Math.min(
        current.identityConfidence ?? 0.8,
        prior.identityConfidence ?? 0.8
      )
      return [
        {
          currentImageId: current.id,
          priorImageId: prior.id,
          canonicalView: current.view,
          comparability:
            confidence >= 0.9
              ? ('highly_comparable' as const)
              : confidence >= 0.65
                ? ('comparable' as const)
                : ('low_confidence' as const),
        },
      ]
    })
    if (pairs.some((pair) => pair.comparability !== 'low_confidence')) {
      return { inspection: candidate, pairs }
    }
  }
  return null
}

export function comparisonConfidenceLabel(value: number | null) {
  if (value == null || value < 0.4) return 'Insufficient evidence'
  if (value < 0.7) return 'Low confidence'
  if (value < 0.9) return 'Moderate confidence'
  return 'High confidence'
}
