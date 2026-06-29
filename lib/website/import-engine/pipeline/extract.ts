// lib/website/import-engine/pipeline/extract.ts
// Routes import input to the correct source adapter.

import 'server-only'
import { detectSourceFromFile } from '@/lib/website/import-engine/detect-source'
import { extractFromPdf } from '@/lib/website/import-engine/adapters/pdf'
import { extractFromImages } from '@/lib/website/import-engine/adapters/image'
import { extractFromCanvaUrl } from '@/lib/website/import-engine/adapters/canva-url'
import type { DesignImportExtraction, DesignImportSourceType, RunDesignImportParams } from '@/lib/website/import-engine/types'

export interface ExtractPipelineResult {
  ok: boolean
  error?: string
  sourceType: DesignImportSourceType
  extraction?: DesignImportExtraction
  warnings: string[]
}

export async function runExtractPipeline(
  params: RunDesignImportParams & { sourceType?: DesignImportSourceType },
): Promise<ExtractPipelineResult> {
  const warnings: string[] = []
  const { tenantId, websiteId, importId, input } = params

  let sourceType: DesignImportSourceType = params.sourceType ?? 'unknown'

  if (input.url) {
    sourceType = detectSourceFromFile({ url: input.url, fileName: input.fileName })
    if (sourceType === 'unknown') sourceType = 'canva_url'
    const canva = await extractFromCanvaUrl({ url: input.url })
    warnings.push(...canva.warnings)
    if (!canva.ok || !canva.extraction) {
      return { ok: false, error: canva.error, sourceType, warnings }
    }
    return { ok: true, sourceType: canva.extraction.sourceType, extraction: canva.extraction, warnings }
  }

  if (input.imageBuffers && input.imageBuffers.length > 0) {
    sourceType = input.imageBuffers.length > 1 ? 'images' : 'image'
    const img = await extractFromImages({
      tenantId, websiteId, importId,
      images: input.imageBuffers,
    })
    warnings.push(...img.warnings)
    if (!img.ok || !img.extraction) return { ok: false, error: img.error, sourceType, warnings }
    return { ok: true, sourceType, extraction: img.extraction, warnings }
  }

  if (input.pdfBuffer) {
    sourceType = detectSourceFromFile({ fileName: input.fileName, mimeType: 'application/pdf' })
    if (sourceType === 'unknown') sourceType = 'pdf'
    const pdf = await extractFromPdf({
      pdfBuffer: input.pdfBuffer,
      tenantId, websiteId, importId,
      sourceType,
    })
    warnings.push(...pdf.warnings)
    if (!pdf.ok || !pdf.extraction) return { ok: false, error: pdf.error, sourceType, warnings }
    return { ok: true, sourceType: pdf.extraction.sourceType, extraction: pdf.extraction, warnings }
  }

  return { ok: false, error: 'No import input provided (PDF, image, or URL required).', sourceType, warnings }
}
