// lib/website/import-engine/pipeline/reconstruct.ts
// Merges AI reconstruction with visual baselines, link mapping, and POV/RSVP integration.

import 'server-only'
import {
  buildPdfLinkMapping,
  deadPdfLinkCount,
  detectRsvpIntent,
  overlaysAndFallbacksForPage,
  type PdfLinkAnnotation,
} from '@/lib/website/canva/pdf/canva-pdf-link-mapper'
import { mapPageVisualAnimation } from '@/lib/website/canva/pdf/canva-pdf-animation-mapper'
import {
  buildAnimationMapping,
  buildSectionAnimation,
  normalizeAnimationLevel,
  type AnimationLevel,
} from '@/lib/website/canva/pdf-animation-recreator'
import type {
  DesignImportExtraction,
  DesignImportReconstruction,
  ReconstructedSection,
} from '@/lib/website/import-engine/types'

export interface ReconstructPipelineResult {
  reconstruction: DesignImportReconstruction
  linkMapping: ReturnType<typeof buildPdfLinkMapping>
  animationMapping: ReturnType<typeof buildAnimationMapping>
  rsvpDetected: boolean
  deadLinksCount: number
  overlaysCount: number
  fallbackButtonsCount: number
  warnings: string[]
}

function isVisualSectionType(t: string): boolean {
  return t === 'canva_pdf_page_visual' || t === 'canva_pdf_visual_section' ||
    t === 'hero' || t === 'about' || t === 'feature_grid' || t === 'image_gallery' ||
    t === 'rich_text' || t === 'banner' || t === 'faq'
}

function isButtonOnly(sections: ReconstructedSection[]): boolean {
  if (sections.length === 0) return true
  return sections.every((s) => s.section_type === 'cta' || s.section_type === 'button')
}

function buildPdfVisualSections(
  extraction: DesignImportExtraction,
  linkMapping: ReturnType<typeof buildPdfLinkMapping>,
  animationLevel: AnimationLevel,
): { sections: ReconstructedSection[]; overlaysCount: number; fallbackButtonsCount: number } {
  const sections: ReconstructedSection[] = []
  let overlaysCount = 0
  let fallbackButtonsCount = 0

  for (const page of extraction.renderedPages) {
    if (!page.publicUrl) continue
    const pageText = extraction.text.split('\n')[page.pageNumber - 1] ?? extraction.text.slice(0, 500)
    const visualAnim = mapPageVisualAnimation(page.pageNumber, pageText, animationLevel)
    const { overlays, fallbackActions } = overlaysAndFallbacksForPage(page.pageNumber, linkMapping)
    overlaysCount += overlays.length
    fallbackButtonsCount += fallbackActions.length

    sections.push({
      section_type: 'canva_pdf_page_visual',
      section_key: `pdf-page-visual-${page.pageNumber}`,
      content: {
        type: 'canva_pdf_page_visual',
        sectionType: 'canva_pdf_page_visual',
        pageNumber: page.pageNumber,
        renderedImageUrl: page.publicUrl,
        thumbnailUrl: page.thumbnailUrl,
        aspectRatio: page.aspectRatio,
        originalWidth: page.width,
        originalHeight: page.height,
        animationPreset: visualAnim.preset,
        visualAnimation: visualAnim,
        overlays,
        fallbackActions,
        mobileBehavior: 'stack_actions_below',
      },
      animation: buildSectionAnimation('hero', page.pageNumber - 1, animationLevel) as unknown as Record<string, unknown>,
    })
  }

  return { sections, overlaysCount, fallbackButtonsCount }
}

function mergeReconstructions(
  ai: DesignImportReconstruction,
  visualBaseline: ReconstructedSection[],
  extraction: DesignImportExtraction,
): DesignImportReconstruction {
  const home = ai.pages[0] ?? { title: 'Home', slug: 'home', sections: [] }
  const aiSections = home.sections.filter((s) => isVisualSectionType(s.section_type) || s.section_type !== 'cta')

  let mergedSections: ReconstructedSection[]

  if (extraction.renderedPages.length > 0) {
    const hasPdfVisual = aiSections.some((s) => s.section_type === 'canva_pdf_page_visual')
    if (hasPdfVisual) {
      mergedSections = aiSections
    } else if (aiSections.length >= 2 && !isButtonOnly(aiSections)) {
      mergedSections = [...visualBaseline, ...aiSections.filter((s) => s.section_type !== 'canva_pdf_page_visual')]
    } else {
      mergedSections = visualBaseline
    }
  } else if (aiSections.length >= 2 && !isButtonOnly(aiSections)) {
    mergedSections = aiSections
  } else if (visualBaseline.length > 0) {
    mergedSections = visualBaseline
  } else {
    mergedSections = aiSections.length > 0 ? aiSections : buildImageHeroFallback(extraction)
  }

  if (isButtonOnly(mergedSections)) {
    mergedSections = visualBaseline.length > 0 ? visualBaseline : buildImageHeroFallback(extraction)
  }

  const detectedComponentCount = Math.max(
    ai.detectedComponentCount,
    mergedSections.length,
    extraction.renderedPages.length,
    extraction.assets.length,
  )

  return {
    ...ai,
    detectedComponentCount,
    pages: [{ ...home, sections: mergedSections }, ...ai.pages.slice(1)],
  }
}

function buildImageHeroFallback(extraction: DesignImportExtraction): ReconstructedSection[] {
  const first = extraction.renderedPages[0] ?? extraction.assets[0]
  if (!first?.publicUrl) return []

  return [{
    section_type: 'hero',
    section_key: 'import-hero',
    content: {
      headline: 'Welcome',
      subheadline: '',
      backgroundImage: first.publicUrl,
      overlay: true,
      overlayOpacity: 40,
      align: 'center',
    },
    animation: { preset: 'fadeUp' },
  }]
}

export function runReconstructPipeline(opts: {
  extraction: DesignImportExtraction
  aiReconstruction?: DesignImportReconstruction | null
  eventSlug: string
  povEnabled: boolean
  animationLevel?: string
}): ReconstructPipelineResult {
  const warnings: string[] = []
  const animationLevel = normalizeAnimationLevel(opts.animationLevel)
  const rsvpDetected = detectRsvpIntent(opts.extraction.text)

  const pdfAnnotations: PdfLinkAnnotation[] = opts.extraction.links.map((l) => ({
    label: l.label,
    url: l.href,
    pageNumber: l.pageNumber ?? 1,
  }))

  const aiLinks = (opts.aiReconstruction?.linkMapping ?? []).map((l) => ({
    label: l.label,
    href: l.href,
    actionType: l.actionType,
    pageNumber: 1,
  }))

  const linkMapping = buildPdfLinkMapping(pdfAnnotations, aiLinks, {
    eventSlug: opts.eventSlug,
    povEnabled: opts.povEnabled,
  })

  const deadLinksCount = deadPdfLinkCount(linkMapping)
  if (deadLinksCount > 0) warnings.push('Some buttons need destination review.')

  const { sections: visualBaseline, overlaysCount, fallbackButtonsCount } = buildPdfVisualSections(
    opts.extraction,
    linkMapping,
    animationLevel,
  )

  const baseAi: DesignImportReconstruction = opts.aiReconstruction ?? {
    theme: { colors: { background: '#0b0b0b', text: '#ffffff', primary: '#7c3aed', accent: '#db2777' } },
    pages: [{ title: 'Home', slug: 'home', sections: [] }],
    linkMapping: linkMapping.map((l) => ({
      id: l.id, label: l.label, href: l.href, actionType: l.actionType, dead: l.dead,
    })),
    animations: { globalStyle: animationLevel },
    detectedComponentCount: Math.max(visualBaseline.length, opts.extraction.assets.length),
    warnings: [],
  }

  const reconstruction = mergeReconstructions(baseAi, visualBaseline, opts.extraction)
  reconstruction.linkMapping = linkMapping.map((l) => ({
    id: l.id, label: l.label, href: l.href, actionType: l.actionType, dead: l.dead,
  }))

  const rsvpEnabled = reconstruction.rsvp?.enabled ?? rsvpDetected
  reconstruction.rsvp = {
    enabled: rsvpEnabled,
    pageCreated: rsvpEnabled && (reconstruction.rsvp?.pageCreated ?? true),
    pageTitle: reconstruction.rsvp?.pageTitle ?? 'RSVP',
    route: `/events/${opts.eventSlug}/rsvp`,
  }

  const allSections = reconstruction.pages.flatMap((p) => p.sections)
  const animationMapping = buildAnimationMapping(
    allSections.map((s) => ({ section_key: s.section_key, section_type: s.section_type, content: s.content })),
    animationLevel,
  )

  warnings.push(...reconstruction.warnings)

  return {
    reconstruction,
    linkMapping,
    animationMapping,
    rsvpDetected,
    deadLinksCount,
    overlaysCount,
    fallbackButtonsCount,
    warnings,
  }
}
