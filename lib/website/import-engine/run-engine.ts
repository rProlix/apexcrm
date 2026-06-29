// lib/website/import-engine/run-engine.ts
// Universal AI Design Import Engine — orchestrates detect → extract → vision → reconstruct → save.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  CONFIDENCE_RETRY_THRESHOLD,
  MAX_IMPORT_ATTEMPTS,
  countImagesInSections,
  countSections,
  needsRetry,
  scoreConfidence,
} from '@/lib/website/import-engine/confidence'
import { detectSourceFromFile } from '@/lib/website/import-engine/detect-source'
import { runExtractPipeline } from '@/lib/website/import-engine/pipeline/extract'
import { analyzeWithVision } from '@/lib/website/import-engine/pipeline/analyze-vision'
import { runReconstructPipeline } from '@/lib/website/import-engine/pipeline/reconstruct'
import { saveConfigEventDraft } from '@/lib/website/import-engine/targets/config-event-target'
import type {
  DesignImportDiagnostics,
  DesignImportReconstruction,
  DesignImportStage,
  RunDesignImportParams,
  RunDesignImportResult,
} from '@/lib/website/import-engine/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export async function runDesignImportEngine(params: RunDesignImportParams): Promise<RunDesignImportResult> {
  const started = Date.now()
  const db = getSupabaseServerClient() as DB
  const stagesCompleted: DesignImportStage[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const maxAttempts = params.options?.maxAttempts ?? MAX_IMPORT_ATTEMPTS

  const { data: site } = await db.from('websites').select('*')
    .eq('id', params.websiteId).eq('tenant_id', params.tenantId).maybeSingle()
  if (!site) return { ok: false, error: 'Event website record not found.' }

  const eventSlug = params.options?.eventSlug ?? String(site.public_slug ?? '')
  const povEnabled = params.options?.povEnabled ?? Boolean(site.pov_enabled)
  const animationLevel = String((site.draft_config as Record<string, unknown> | null)?.animationLevel ?? 'balanced')

  let sourceType = detectSourceFromFile({
    url: params.input.url,
    fileName: params.input.fileName,
    mimeType: params.input.pdfBuffer ? 'application/pdf' : undefined,
  })
  stagesCompleted.push('detect')

  try {
    await db.from('website_canva_imports').update({
      ai_conversion_status: 'analyzing',
      status: 'importing',
    }).eq('id', params.importId)
  } catch { /* non-fatal */ }

  const extractResult = await runExtractPipeline({ ...params, sourceType })
  warnings.push(...extractResult.warnings)
  if (!extractResult.ok || !extractResult.extraction) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', params.importId)
    return { ok: false, error: extractResult.error ?? 'Extraction failed.', diagnostics: buildPartialDiagnostics(extractResult.sourceType, stagesCompleted, warnings, errors, started, 0) }
  }
  sourceType = extractResult.sourceType
  const extraction = extractResult.extraction
  stagesCompleted.push('extract', 'render')

  let bestReconstruction: DesignImportReconstruction | null = null
  let bestConfidence = scoreConfidence({
    detectedComponents: 0,
    reconstructedSections: 0,
    imagesFound: extraction.assets.length,
    imagesInSections: 0,
    buttonsFound: extraction.links.length,
    buttonsMapped: 0,
    renderedPages: extraction.renderedPages.length,
    hasTheme: false,
    hasResponsiveHints: false,
  })
  let bestReconstructResult: ReturnType<typeof runReconstructPipeline> | null = null
  let attemptCount = 0
  let geminiTokenUsage: Record<string, unknown> | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount = attempt
    stagesCompleted.push('analyze')

    let aiReconstruction: DesignImportReconstruction | null = null
    try {
      const vision = await analyzeWithVision({
        extraction,
        sourceType,
        eventSlug,
        povEnabled,
        userPrompt: params.options?.userPrompt,
        attempt,
      })
      warnings.push(...vision.warnings)
      geminiTokenUsage = vision.tokenUsage
      if (vision.ok && vision.reconstruction) {
        aiReconstruction = vision.reconstruction
      } else if (vision.error) {
        errors.push(vision.error)
        warnings.push('Continuing with visual baseline reconstruction.')
      }
    } catch (e) {
      warnings.push(`AI pass ${attempt} failed: ${e instanceof Error ? e.message : 'error'}`)
    }

    stagesCompleted.push('reconstruct')
    const reconstructResult = runReconstructPipeline({
      extraction,
      aiReconstruction,
      eventSlug,
      povEnabled,
      animationLevel,
    })
    warnings.push(...reconstructResult.warnings)

    const confidence = scoreConfidence({
      detectedComponents: reconstructResult.reconstruction.detectedComponentCount,
      reconstructedSections: countSections(reconstructResult.reconstruction),
      imagesFound: extraction.assets.length + extraction.renderedPages.length,
      imagesInSections: countImagesInSections(reconstructResult.reconstruction),
      buttonsFound: extraction.links.length,
      buttonsMapped: reconstructResult.linkMapping.filter((l) => !l.dead).length,
      renderedPages: extraction.renderedPages.length,
      hasTheme: Object.keys(reconstructResult.reconstruction.theme ?? {}).length > 0,
      hasResponsiveHints: reconstructResult.reconstruction.pages.some((p) =>
        p.sections.some((s) => s.responsive && Object.keys(s.responsive).length > 0),
      ),
    })

    stagesCompleted.push('validate')

    if (confidence.overall > bestConfidence.overall ||
        (needsRetry(bestConfidence, bestReconstruction ?? reconstructResult.reconstruction) &&
         !needsRetry(confidence, reconstructResult.reconstruction))) {
      bestReconstruction = reconstructResult.reconstruction
      bestConfidence = confidence
      bestReconstructResult = reconstructResult
    }

    if (!needsRetry(confidence, reconstructResult.reconstruction) &&
        confidence.overall >= CONFIDENCE_RETRY_THRESHOLD) {
      break
    }
  }

  if (!bestReconstruction || !bestReconstructResult) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', params.importId)
    return { ok: false, error: 'Import reconstruction failed after all attempts.', diagnostics: buildPartialDiagnostics(sourceType, stagesCompleted, warnings, errors, started, attemptCount) }
  }

  const diagnostics: DesignImportDiagnostics = {
    importType: sourceType,
    pages: extraction.pageCount,
    imagesFound: extraction.assets.filter((a) => a.kind === 'image' || a.kind === 'background').length,
    graphicsFound: extraction.assets.length,
    illustrationsFound: extraction.assets.filter((a) => a.kind === 'illustration').length,
    fontsDetected: extraction.fonts.length,
    buttonsFound: extraction.links.length,
    linksFound: bestReconstructResult.linkMapping.length,
    backgroundsFound: extraction.assets.filter((a) => a.kind === 'background').length + extraction.renderedPages.length,
    animationsCreated: countSections(bestReconstruction),
    sectionsCreated: countSections(bestReconstruction),
    responsiveLayout: bestReconstruction.pages.some((p) => p.sections.some((s) => s.responsive)),
    confidence: bestConfidence,
    warnings,
    errors,
    timeTakenMs: Date.now() - started,
    geminiTokenUsage,
    attemptCount,
    stagesCompleted: [...new Set(stagesCompleted)],
  }

  stagesCompleted.push('save')
  const saved = await saveConfigEventDraft({
    tenantId: params.tenantId,
    websiteId: params.websiteId,
    importId: params.importId,
    createdBy: params.createdBy,
    extraction,
    reconstruction: bestReconstruction,
    diagnostics,
    linkMapping: bestReconstructResult.linkMapping,
    animationMapping: bestReconstructResult.animationMapping,
    renderedPages: extraction.renderedPages,
    animationLevel,
    povEnabled,
    povEventId: site.pov_event_id,
  })

  if (!saved.ok) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', params.importId)
    return { ok: false, error: saved.error, diagnostics }
  }

  stagesCompleted.push('complete')
  diagnostics.stagesCompleted = [...new Set(stagesCompleted)]

  return {
    ok: true,
    draftPreviewUrl: saved.draftPreviewUrl,
    liveUrl: saved.liveUrl,
    reconstruction: bestReconstruction,
    extraction,
    diagnostics,
    publishAvailable: true,
  }
}

function buildPartialDiagnostics(
  importType: RunDesignImportResult['diagnostics'] extends infer D ? D extends { importType: infer T } ? T : never : never,
  stages: DesignImportStage[],
  warnings: string[],
  errors: string[],
  started: number,
  attemptCount: number,
): DesignImportDiagnostics {
  return {
    importType: importType as DesignImportDiagnostics['importType'],
    pages: 0,
    imagesFound: 0,
    graphicsFound: 0,
    illustrationsFound: 0,
    fontsDetected: 0,
    buttonsFound: 0,
    linksFound: 0,
    backgroundsFound: 0,
    animationsCreated: 0,
    sectionsCreated: 0,
    responsiveLayout: false,
    confidence: {
      visualMatch: 0, layoutMatch: 0, typographyMatch: 0, colorMatch: 0,
      imagesMatch: 0, buttonsMatch: 0, animationsMatch: 0, responsiveMatch: 0, overall: 0,
    },
    warnings,
    errors,
    timeTakenMs: Date.now() - started,
    attemptCount,
    stagesCompleted: stages,
  }
}

/** Load PDF from an existing website_canva_imports record and run the engine. */
export async function runDesignImportFromCanvaImportRecord(params: {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
}): Promise<RunDesignImportResult & {
  sectionCount?: number
  pageCount?: number
  renderedPageCount?: number
  linkMapping?: unknown[]
}> {
  const db = getSupabaseServerClient() as DB
  const { data: imp } = await db.from('website_canva_imports').select('*')
    .eq('id', params.importId).eq('tenant_id', params.tenantId).maybeSingle()
  if (!imp) return { ok: false, error: 'Canva import record not found.' }
  if (!imp.pdf_storage_path) return { ok: false, error: 'No uploaded PDF found for this import.' }

  const bucket = (imp.bucket as string) || 'document-assets'
  let pdfBuffer: Buffer
  try {
    const { data: blob, error: dlErr } = await db.storage.from(bucket).download(imp.pdf_storage_path)
    if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed')
    pdfBuffer = Buffer.from(await blob.arrayBuffer())
  } catch (e) {
    return { ok: false, error: `Failed to read the uploaded PDF: ${e instanceof Error ? e.message : 'storage error'}` }
  }

  const summary = (imp.import_summary as Record<string, unknown>) ?? {}
  const result = await runDesignImportEngine({
    tenantId: params.tenantId,
    websiteId: params.websiteId,
    importId: params.importId,
    createdBy: params.createdBy,
    input: {
      pdfBuffer,
      fileName: (imp.pdf_file_name as string) ?? 'import.pdf',
    },
    options: {
      userPrompt: typeof summary.userPrompt === 'string' ? summary.userPrompt : undefined,
    },
  })

  if (!result.ok) return result

  const sections = result.reconstruction?.pages.flatMap((p) => p.sections) ?? []
  return {
    ...result,
    sectionCount: sections.length,
    pageCount: result.extraction?.pageCount,
    renderedPageCount: result.extraction?.renderedPages.length,
    linkMapping: result.reconstruction?.linkMapping,
  }
}
