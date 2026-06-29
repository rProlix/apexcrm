// lib/website/import-engine/adapters/pdf.ts
// PDF adapter — render pages + extract text/links for the universal import engine.

import 'server-only'
import { renderCanvaPdfPages, PDF_RENDER_ZERO_MESSAGE } from '@/lib/website/canva/pdf/render-canva-pdf-pages'
import { extractCanvaPdfTextAndLinks } from '@/lib/website/canva/pdf/pdf-visual-extractor'
import type { DesignImportExtraction, DesignImportSourceType } from '@/lib/website/import-engine/types'

export interface PdfAdapterParams {
  pdfBuffer: Buffer
  tenantId: string
  websiteId: string
  importId: string
  sourceType?: DesignImportSourceType
}

export interface PdfAdapterResult {
  ok: boolean
  error?: string
  extraction?: DesignImportExtraction
  warnings: string[]
}

export async function extractFromPdf(params: PdfAdapterParams): Promise<PdfAdapterResult> {
  const warnings: string[] = []
  const sourceType = params.sourceType ?? 'pdf'

  const renderResult = await renderCanvaPdfPages({
    pdfBuffer: params.pdfBuffer,
    tenantId: params.tenantId,
    websiteId: params.websiteId,
    importId: params.importId,
  })
  warnings.push(...renderResult.warnings)

  if (!renderResult.ok || renderResult.renderedPageCount === 0) {
    return { ok: false, error: renderResult.error ?? PDF_RENDER_ZERO_MESSAGE, warnings }
  }

  let textExtraction: Awaited<ReturnType<typeof extractCanvaPdfTextAndLinks>>
  try {
    textExtraction = await extractCanvaPdfTextAndLinks({
      pdfBuffer: params.pdfBuffer,
      renderedPages: renderResult.pages,
    })
    warnings.push(...textExtraction.warnings)
  } catch (e) {
    return {
      ok: false,
      error: `Failed to extract PDF content: ${e instanceof Error ? e.message : 'error'}`,
      warnings,
    }
  }

  const allText = textExtraction.pages.map((p) => p.text).join('\n')
  const links = textExtraction.pages.flatMap((p) =>
    p.links.map((l) => ({
      label: l.label ?? l.url ?? 'Link',
      href: l.url ?? '#',
      pageNumber: l.pageNumber,
      xPercent: l.x !== undefined && l.pageWidth ? (l.x / l.pageWidth) * 100 : undefined,
      yPercent: l.y !== undefined && l.pageHeight ? (l.y / l.pageHeight) * 100 : undefined,
    })),
  )

  const assets = renderResult.pages.map((p) => ({
    id: `page-${p.pageNumber}`,
    kind: 'background' as const,
    publicUrl: p.publicUrl,
    storagePath: p.storagePath,
    pageNumber: p.pageNumber,
    width: p.width,
    height: p.height,
  }))

  const extraction: DesignImportExtraction = {
    sourceType,
    pageCount: renderResult.pageCount,
    renderedPages: renderResult.pages.map((p) => ({
      pageNumber: p.pageNumber,
      publicUrl: p.publicUrl,
      storagePath: p.storagePath,
      thumbnailUrl: p.thumbnailUrl,
      aspectRatio: p.aspectRatio,
      width: p.width,
      height: p.height,
    })),
    text: allText,
    links,
    assets,
    fonts: [],
    colors: [],
    warnings: textExtraction.warnings,
  }

  return { ok: true, extraction, warnings }
}
