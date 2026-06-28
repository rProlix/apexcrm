// lib/website/canva/pdfConvert.ts
// SERVER-ONLY. Visual-first Canva PDF conversion: rendered page images are the
// primary website output; AI adds link mapping, RSVP, and animation hints only.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { callGeminiMultimodal } from '@/lib/ai/geminiRequest'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { safeParseGeminiJson } from '@/lib/ai/parseGeminiJson'
import {
  buildAnimationMapping, buildSectionAnimation, normalizeAnimationLevel,
  type AnimationLevel,
} from '@/lib/website/canva/pdf-animation-recreator'
import {
  renderCanvaPdfPages,
  PDF_RENDER_ZERO_MESSAGE,
  type RenderedCanvaPdfPage,
} from '@/lib/website/canva/pdf/render-canva-pdf-pages'
import { extractCanvaPdfTextAndLinks } from '@/lib/website/canva/pdf/pdf-visual-extractor'
import {
  buildPdfLinkMapping,
  deadPdfLinkCount,
  detectRsvpIntent,
  overlaysAndFallbacksForPage,
  type PdfMappedAction,
} from '@/lib/website/canva/pdf/canva-pdf-link-mapper'
import {
  mapPageVisualAnimation,
  PDF_VISUAL_ANIMATION_NOTE,
} from '@/lib/website/canva/pdf/canva-pdf-animation-mapper'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

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

export interface ConvertedSection {
  section_type: 'canva_pdf_page_visual'
  section_key: string
  content: Record<string, unknown>
  animation: ReturnType<typeof buildSectionAnimation>
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
}

interface AiSchema {
  linkMapping?: Array<{ label?: string; href?: string; actionType?: string; pageNumber?: number }>
  interactiveOverlays?: Array<{ label?: string; href?: string; actionType?: string; pageNumber?: number }>
  eventMetadata?: Record<string, unknown>
  theme?: Record<string, unknown>
  pageAnimations?: Array<{ pageNumber?: number; preset?: string }>
  rsvp?: { enabled?: boolean; pageCreated?: boolean; pageTitle?: string; fields?: string[] }
  warnings?: string[]
}

function buildAiPrompt(opts: {
  eventSlug: string
  povEnabled: boolean
  animationLevel: AnimationLevel
  extractedText: string
  renderedPagesJson: string
  linksJson: string
}): string {
  return [
    'You assist a visual-first Canva PDF import. Rendered PDF page images ARE the website design.',
    'Do NOT replace the design with generic text sections. Your job is metadata only:',
    '- Map buttons/links (RSVP, Registry, Target, Amazon, Camera, Gallery) to working routes.',
    '- Detect RSVP/sign-up intent.',
    '- Suggest animation presets per page (fadeIn, fadeUp, softZoomIn, premiumBlurReveal, characterPopIn).',
    '- Extract event metadata (date, location, hosts).',
    '',
    'Rendered pages (source of truth for visuals):',
    opts.renderedPagesJson.slice(0, 4000),
    '',
    'Extracted text:',
    opts.extractedText.slice(0, 8000),
    '',
    'Extracted PDF links:',
    opts.linksJson.slice(0, 3000),
    '',
    'Routes:',
    `- RSVP → /events/${opts.eventSlug}/rsvp`,
    `- Event Camera → /events/${opts.eventSlug}/camera`,
    `- Gallery → /events/${opts.eventSlug}/gallery`,
    '- Preserve Amazon/Target/registry external URLs exactly.',
    opts.povEnabled ? '- POV enabled: include camera + gallery actions.' : '',
    '',
    'Return ONLY minified JSON:',
    '{ "linkMapping":[{"label","href","actionType","pageNumber"}],',
    '  "pageAnimations":[{"pageNumber","preset"}],',
    '  "rsvp":{"enabled":boolean,"pageCreated":boolean,"pageTitle":string},',
    '  "eventMetadata":{...},"theme":{...},"warnings":[] }',
  ].filter(Boolean).join('\n')
}

function buildPageVisualSections(
  renderedPages: RenderedCanvaPdfPage[],
  extractionPages: Awaited<ReturnType<typeof extractCanvaPdfTextAndLinks>>['pages'],
  linkMapping: PdfMappedAction[],
  animationLevel: AnimationLevel,
  pageAnimations: Array<{ pageNumber?: number; preset?: string }>,
): { sections: ConvertedSection[]; overlaysCount: number; fallbackButtonsCount: number } {
  const sections: ConvertedSection[] = []
  let overlaysCount = 0
  let fallbackButtonsCount = 0

  for (const rendered of renderedPages) {
    if (!rendered.publicUrl) continue
    const extractPage = extractionPages.find((p) => p.pageNumber === rendered.pageNumber)
    const pageText = extractPage?.text ?? ''
    const aiAnim = pageAnimations.find((a) => a.pageNumber === rendered.pageNumber)
    const visualAnim = mapPageVisualAnimation(rendered.pageNumber, pageText, animationLevel, aiAnim?.preset)
    const { overlays, fallbackActions } = overlaysAndFallbacksForPage(rendered.pageNumber, linkMapping)
    overlaysCount += overlays.length
    fallbackButtonsCount += fallbackActions.length

    sections.push({
      section_type: 'canva_pdf_page_visual',
      section_key: `pdf-page-visual-${rendered.pageNumber}`,
      content: {
        type: 'canva_pdf_page_visual',
        sectionType: 'canva_pdf_page_visual',
        pageNumber: rendered.pageNumber,
        renderedImageUrl: rendered.publicUrl,
        thumbnailUrl: rendered.thumbnailUrl,
        aspectRatio: rendered.aspectRatio,
        originalWidth: rendered.width,
        originalHeight: rendered.height,
        animationPreset: visualAnim.preset,
        visualAnimation: visualAnim,
        overlays,
        fallbackActions,
        mobileBehavior: 'stack_actions_below',
      },
      animation: buildSectionAnimation('hero', rendered.pageNumber - 1, animationLevel),
    })
  }

  return { sections, overlaysCount, fallbackButtonsCount }
}

export async function convertCanvaPdfToDraft(params: {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
}): Promise<PdfConversionResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId, websiteId, importId } = params
  const warnings: string[] = [PDF_VISUAL_ANIMATION_NOTE]

  const { data: imp } = await db.from('website_canva_imports').select('*')
    .eq('id', importId).eq('tenant_id', tenantId).maybeSingle()
  if (!imp) return { ok: false, error: 'Canva import record not found.' }
  if (!imp.pdf_storage_path) return { ok: false, error: 'No uploaded PDF found for this import.' }

  const { data: site } = await db.from('websites').select('*')
    .eq('id', websiteId).eq('tenant_id', tenantId).maybeSingle()
  if (!site) return { ok: false, error: 'Event website record not found.' }

  const summary = (imp.import_summary as Record<string, unknown>) ?? {}
  const animationLevel = normalizeAnimationLevel(summary.animationRecreationLevel)
  const povEnabled = Boolean(site.pov_enabled)
  const eventSlug = String(site.public_slug ?? '')

  await db.from('website_canva_imports').update({ ai_conversion_status: 'analyzing', status: 'importing' }).eq('id', importId)

  const bucket = (imp.bucket as string) || 'document-assets'
  let pdfBuffer: Buffer
  let pageCount = (imp.pdf_page_count as number) ?? null
  try {
    const { data: blob, error: dlErr } = await db.storage.from(bucket).download(imp.pdf_storage_path)
    if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed')
    pdfBuffer = Buffer.from(await blob.arrayBuffer())
    if (!pageCount) pageCount = estimatePdfPageCount(pdfBuffer)
  } catch (e) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: `Failed to read the uploaded PDF: ${e instanceof Error ? e.message : 'storage error'}` }
  }

  // STEP 1: Render all PDF pages (required — fail if zero)
  const renderResult = await renderCanvaPdfPages({ pdfBuffer, tenantId, websiteId, importId })
  warnings.push(...renderResult.warnings)
  if (!renderResult.ok || renderResult.renderedPageCount === 0) {
    await db.from('website_canva_imports').update({
      ai_conversion_status: 'failed',
      status: 'failed',
      warnings,
    }).eq('id', importId)
    return { ok: false, error: renderResult.error ?? PDF_RENDER_ZERO_MESSAGE, warnings }
  }

  // STEP 2: Extract text + links
  let extraction: Awaited<ReturnType<typeof extractCanvaPdfTextAndLinks>>
  try {
    extraction = await extractCanvaPdfTextAndLinks({ pdfBuffer, renderedPages: renderResult.pages })
    warnings.push(...extraction.warnings)
  } catch (e) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: `Failed to extract PDF content: ${e instanceof Error ? e.message : 'error'}` }
  }

  const allText = extraction.pages.map((p) => p.text).join('\n')
  const allAnnotations = extraction.pages.flatMap((p) => p.links)
  const rsvpDetected = detectRsvpIntent(allText)

  // STEP 3: AI for link mapping + metadata only (non-blocking on failure)
  let schema: AiSchema = {}
  const model = getWebsiteAiGeminiModel()
  try {
    const aiParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
      text: buildAiPrompt({
        eventSlug,
        povEnabled,
        animationLevel,
        extractedText: allText,
        renderedPagesJson: JSON.stringify(renderResult.pages.map((p) => ({ pageNumber: p.pageNumber, publicUrl: p.publicUrl }))),
        linksJson: JSON.stringify(allAnnotations.slice(0, 40)),
      }),
    }]
    for (const p of renderResult.pages.slice(0, 4)) {
      if (p.publicUrl) {
        try {
          const imgRes = await fetch(p.publicUrl)
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer())
            const mime = imgRes.headers.get('content-type')?.includes('png') ? 'image/png' : 'image/webp'
            aiParts.push({ inlineData: { mimeType: mime, data: buf.toString('base64') } })
          }
        } catch { /* non-fatal */ }
      }
    }
    const ai = await callGeminiMultimodal({ model, feature: 'canva-pdf-convert', temperature: 0.3, timeoutMs: 90_000, parts: aiParts })
    if (ai.text) {
      const parsed = safeParseGeminiJson<AiSchema>(ai.text)
      if (parsed.data) schema = parsed.data
      else warnings.push('AI metadata parse failed; using PDF link extraction only.')
    } else {
      warnings.push('AI metadata unavailable; using PDF link extraction only.')
    }
  } catch {
    warnings.push('AI metadata unavailable; using PDF link extraction only.')
  }

  const aiButtons = [
    ...(schema.linkMapping ?? []),
    ...(schema.interactiveOverlays ?? []).map((o) => ({ label: o.label, href: o.href, actionType: o.actionType, pageNumber: o.pageNumber })),
  ]
  const linkMapping = buildPdfLinkMapping(allAnnotations, aiButtons, { eventSlug, povEnabled })
  const deadLinks = deadPdfLinkCount(linkMapping)
  if (deadLinks > 0) warnings.push('Some buttons need destination review.')
  if (linkMapping.some((l) => !l.hasCoordinates)) {
    warnings.push('Link coordinates unavailable for some buttons; fallback buttons were used.')
  }

  const { sections: visualSections, overlaysCount, fallbackButtonsCount } = buildPageVisualSections(
    renderResult.pages,
    extraction.pages,
    linkMapping,
    animationLevel,
    schema.pageAnimations ?? [],
  )

  if (visualSections.length === 0) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: PDF_RENDER_ZERO_MESSAGE, warnings }
  }

  const rsvpEnabled = schema.rsvp?.enabled ?? rsvpDetected
  const rsvpPageCreated = rsvpEnabled && (schema.rsvp?.pageCreated ?? true)

  if (Array.isArray(schema.warnings)) warnings.push(...schema.warnings.filter((w) => typeof w === 'string'))

  const animationMapping = buildAnimationMapping(
    visualSections.map((s) => ({ section_key: s.section_key, section_type: s.section_type, content: s.content })),
    animationLevel,
  )

  const beforeDraft = (site.draft_config as Record<string, unknown>) ?? {}
  const now = new Date().toISOString()

  const draftConfig: Record<string, unknown> = {
    websiteType: 'invitational',
    sourceType: 'canva_pdf',
    canvaImportId: importId,
    canvaImportMode: 'converted',
    animationLevel,
    theme: schema.theme ?? {},
    eventMetadata: schema.eventMetadata ?? {},
    povEnabled,
    povEventId: site.pov_event_id ?? null,
    linkMapping,
    visualFirst: true,
    renderedPages: renderResult.pages,
    rsvp: {
      enabled: rsvpEnabled,
      pageCreated: rsvpPageCreated,
      pageTitle: schema.rsvp?.pageTitle ?? 'RSVP',
      route: `/events/${eventSlug}/rsvp`,
    },
    savedAt: now,
    pages: [{ title: 'Home', slug: 'home', sections: visualSections }],
    warnings,
  }

  const newStatus = site.status === 'published' ? 'published' : 'draft'
  const { error: upErr } = await db.from('websites').update({
    draft_config: draftConfig,
    canva_import_enabled: true,
    canva_import_id: importId,
    status: newStatus,
  }).eq('id', websiteId).eq('tenant_id', tenantId)
  if (upErr) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: `Failed to save converted draft: ${upErr.message}` }
  }

  try {
    await db.from('website_canva_imports').update({
      status: 'converted',
      ai_conversion_status: 'converted',
      animation_preservation: 'approximate',
      pdf_page_count: pageCount,
      pdf_analysis: { textLength: allText.length, rsvpDetected, visualFirst: true },
      visual_extraction: { pageCount: extraction.pageCount, renderedPageCount: renderResult.renderedPageCount },
      rendered_pages: renderResult.pages,
      link_mapping: linkMapping,
      rsvp_mapping: draftConfig.rsvp,
      interactive_overlays: visualSections.flatMap((s) => (s.content.overlays as unknown[]) ?? []),
      converted_pages: draftConfig.pages,
      animation_mapping: animationMapping,
      ai_conversion_summary: {
        visualSectionsCount: visualSections.length,
        renderedPageCount: renderResult.renderedPageCount,
        overlaysCount,
        fallbackButtonsCount,
        mappedLinksCount: linkMapping.length,
        deadLinksCount: deadLinks,
        rsvpPageCreated,
        model,
      },
      warnings,
    }).eq('id', importId)
  } catch { /* non-fatal if migration not applied */ }

  try {
    await db.from('website_canva_import_runs').insert({
      tenant_id: tenantId, business_id: null, website_id: websiteId, canva_import_id: importId,
      run_type: 'apply', status: 'completed',
      before_draft_snapshot: beforeDraft, after_draft_snapshot: draftConfig,
      warnings, created_by: params.createdBy ?? null, completed_at: now,
    })
  } catch { /* non-fatal */ }

  return {
    ok: true,
    draftPreviewUrl: `/events/${eventSlug}?preview=draft`,
    liveUrl: `/events/${eventSlug}`,
    sectionCount: visualSections.length,
    pageCount: pageCount ?? undefined,
    warnings,
    eventMetadata: schema.eventMetadata ?? {},
    animationMappingCount: animationMapping.sectionAnimations.length,
    renderedPageCount: renderResult.renderedPageCount,
    extractedLinksCount: extraction.extractedLinksCount,
    detectedButtonsCount: aiButtons.length,
    mappedLinksCount: linkMapping.length,
    deadLinksCount: deadLinks,
    overlaysCount,
    fallbackButtonsCount,
    rsvpDetected,
    rsvpPageCreated,
    visualSectionsCount: visualSections.length,
    renderedPagesUrlsPresent: renderResult.pages.every((p) => !!p.publicUrl),
    publishAvailable: true,
    linkMapping,
  }
}
