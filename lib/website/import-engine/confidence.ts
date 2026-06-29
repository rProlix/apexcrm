// lib/website/import-engine/confidence.ts
// Confidence scoring and validation for import reconstructions.

import type { DesignImportConfidence, DesignImportReconstruction } from '@/lib/website/import-engine/types'

export const CONFIDENCE_RETRY_THRESHOLD = 90
export const COMPONENT_COVERAGE_THRESHOLD = 0.7
export const MAX_IMPORT_ATTEMPTS = 3

export function scoreConfidence(opts: {
  detectedComponents: number
  reconstructedSections: number
  imagesFound: number
  imagesInSections: number
  buttonsFound: number
  buttonsMapped: number
  renderedPages: number
  hasTheme: boolean
  hasResponsiveHints: boolean
}): DesignImportConfidence {
  const sectionRatio = opts.detectedComponents > 0
    ? Math.min(1, opts.reconstructedSections / opts.detectedComponents)
    : opts.reconstructedSections > 0 ? 0.85 : 0.2

  const imageRatio = opts.imagesFound > 0
    ? Math.min(1, opts.imagesInSections / opts.imagesFound)
    : opts.reconstructedSections > 0 ? 0.75 : 0.3

  const buttonRatio = opts.buttonsFound > 0
    ? Math.min(1, opts.buttonsMapped / opts.buttonsFound)
    : 1

  const visualMatch = Math.round(Math.min(100, (opts.renderedPages > 0 ? 40 : 0) + sectionRatio * 60))
  const layoutMatch = Math.round(sectionRatio * 100)
  const typographyMatch = opts.hasTheme ? 88 : 65
  const colorMatch = opts.hasTheme ? 92 : 60
  const imagesMatch = Math.round(imageRatio * 100)
  const buttonsMatch = Math.round(buttonRatio * 100)
  const animationsMatch = opts.reconstructedSections > 0 ? 90 : 50
  const responsiveMatch = opts.hasResponsiveHints ? 88 : 72

  const overall = Math.round(
    (visualMatch * 0.22 + layoutMatch * 0.2 + typographyMatch * 0.1 + colorMatch * 0.1 +
      imagesMatch * 0.15 + buttonsMatch * 0.1 + animationsMatch * 0.08 + responsiveMatch * 0.05),
  )

  return {
    visualMatch, layoutMatch, typographyMatch, colorMatch,
    imagesMatch, buttonsMatch, animationsMatch, responsiveMatch,
    overall,
  }
}

export function needsRetry(confidence: DesignImportConfidence, reconstruction: DesignImportReconstruction): boolean {
  if (confidence.overall < CONFIDENCE_RETRY_THRESHOLD) return true
  const coverage = reconstruction.detectedComponentCount > 0
    ? countSections(reconstruction) / reconstruction.detectedComponentCount
    : countSections(reconstruction) >= 3 ? 1 : 0
  if (coverage < COMPONENT_COVERAGE_THRESHOLD) return true
  const buttonOnly = countSections(reconstruction) > 0 &&
    reconstruction.pages.every((p) =>
      p.sections.every((s) => s.section_type === 'cta' || s.section_type === 'button'),
    )
  return buttonOnly
}

export function countSections(reconstruction: DesignImportReconstruction): number {
  return reconstruction.pages.reduce((n, p) => n + p.sections.length, 0)
}

export function countImagesInSections(reconstruction: DesignImportReconstruction): number {
  let n = 0
  for (const page of reconstruction.pages) {
    for (const s of page.sections) {
      const c = s.content
      if (typeof c.backgroundImage === 'string') n++
      if (Array.isArray(c.images)) n += c.images.length
      if (Array.isArray(c.items)) {
        for (const it of c.items as Array<Record<string, unknown>>) {
          if (typeof it.image === 'string') n++
        }
      }
      if (typeof c.renderedImageUrl === 'string') n++
    }
  }
  return n
}
