// lib/website/canva/pdfConvert.ts
// SERVER-ONLY. Facade for Canva PDF conversion — delegates to the Universal AI Design Import Engine.

import 'server-only'
import { runDesignImportFromCanvaImportRecord } from '@/lib/website/import-engine/run-engine'
import type { PdfMappedAction } from '@/lib/website/canva/pdf/canva-pdf-link-mapper'

export type ConversionStyle = 'faithful' | 'clean_premium' | 'mobile_first'

export function normalizeConversionStyle(value: unknown): ConversionStyle {
  const v = String(value ?? '').toLowerCase()
  if (v.includes('clean') || v.includes('premium')) return 'clean_premium'
  if (v.includes('mobile')) return 'mobile_first'
  return 'faithful'
}

export function estimatePdfPageCount(buffer: Buffer): number {
  try {
    const text = buffer.toString('latin1')
    const matches = text.match(/\/Type\s*\/Page[^s]/g)
    return matches && matches.length > 0 ? matches.length : 1
  } catch {
    return 1
  }
}

export interface PdfConversionResult {
  ok: boolean
  error?: string
  draftPreviewUrl?: string
  liveUrl?: string
  sectionCount?: number
  pageCount?: number
  warnings?: string[]
  eventMetadata?: Record<string, unknown>
  animationMappingCount?: number
  renderedPageCount?: number
  extractedLinksCount?: number
  detectedButtonsCount?: number
  mappedLinksCount?: number
  deadLinksCount?: number
  overlaysCount?: number
  fallbackButtonsCount?: number
  rsvpDetected?: boolean
  rsvpPageCreated?: boolean
  visualSectionsCount?: number
  renderedPagesUrlsPresent?: boolean
  publishAvailable?: boolean
  linkMapping?: PdfMappedAction[]
  diagnostics?: Record<string, unknown>
  confidence?: Record<string, unknown>
  importEngine?: boolean
}

export async function convertCanvaPdfToDraft(params: {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
}): Promise<PdfConversionResult> {
  const result = await runDesignImportFromCanvaImportRecord(params)
  if (!result.ok) {
    return { ok: false, error: result.error, warnings: result.diagnostics?.warnings, diagnostics: result.diagnostics as unknown as Record<string, unknown> }
  }

  const diagnostics = result.diagnostics
  const linkMapping = (result.linkMapping ?? []) as PdfMappedAction[]
  const visualSectionsCount = result.sectionCount ?? diagnostics?.sectionsCreated ?? 0
  const renderedPageCount = result.renderedPageCount ?? diagnostics?.pages ?? 0

  return {
    ok: true,
    draftPreviewUrl: result.draftPreviewUrl,
    liveUrl: result.liveUrl,
    sectionCount: visualSectionsCount,
    pageCount: result.pageCount,
    warnings: diagnostics?.warnings ?? [],
    eventMetadata: result.reconstruction?.eventMetadata,
    animationMappingCount: diagnostics?.animationsCreated,
    renderedPageCount,
    extractedLinksCount: diagnostics?.linksFound,
    detectedButtonsCount: diagnostics?.buttonsFound,
    mappedLinksCount: linkMapping.length,
    deadLinksCount: linkMapping.filter((l) => l.dead).length,
    overlaysCount: undefined,
    fallbackButtonsCount: undefined,
    rsvpDetected: result.reconstruction?.rsvp?.enabled,
    rsvpPageCreated: result.reconstruction?.rsvp?.pageCreated,
    visualSectionsCount,
    renderedPagesUrlsPresent: renderedPageCount > 0,
    publishAvailable: result.publishAvailable ?? true,
    linkMapping,
    diagnostics: diagnostics as unknown as Record<string, unknown>,
    confidence: diagnostics?.confidence as unknown as Record<string, unknown>,
    importEngine: true,
  }
}
