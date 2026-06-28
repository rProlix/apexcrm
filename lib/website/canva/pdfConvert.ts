// lib/website/canva/pdfConvert.ts
// SERVER-ONLY. Hybrid Canva PDF conversion: visual fidelity (rendered page images)
// + native functionality (links, RSVP, POV CTAs) + AI rebuild layer.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { callGeminiMultimodal } from '@/lib/ai/geminiRequest'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { safeParseGeminiJson } from '@/lib/ai/parseGeminiJson'
import {
  buildAnimationMapping, buildSectionAnimation, normalizeAnimationLevel,
  PDF_ANIMATION_NOTE, type AnimationLevel,
} from '@/lib/website/canva/pdf-animation-recreator'
import { extractCanvaPdfVisuals } from '@/lib/website/canva/pdf/pdf-visual-extractor'
import {
  buildLinkMapping, deadLinkCount, detectRsvpIntent, type MappedLink,
} from '@/lib/website/canva/link-mapper'
import { mapPageBackgroundAnimation, mapVisualLayerAnimation, inferVisualLayerKind } from '@/lib/website/canva/visual-animation-mapper'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

const SUPPORTED_SECTION_TYPES = ['hero', 'about', 'image_gallery', 'feature_grid', 'cta', 'rich_text', 'canva_pdf_visual_section'] as const
type ConvertedSectionType = (typeof SUPPORTED_SECTION_TYPES)[number]

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
    const count = matches ? matches.length : 0
    return count > 0 ? count : 1
  } catch {
    return 1
  }
}

export interface ConvertedSection {
  section_type: ConvertedSectionType
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
  extractedGraphicsCount?: number
  extractedLinksCount?: number
  detectedButtonsCount?: number
  mappedLinksCount?: number
  deadLinksCount?: number
  rsvpDetected?: boolean
  rsvpPageCreated?: boolean
  visualSectionsCount?: number
  characterAnimationCount?: number
  publishAvailable?: boolean
  linkMapping?: MappedLink[]
}

interface AiOverlay { id?: string; label?: string; actionType?: string; href?: string; pageNumber?: number; x?: number; y?: number; width?: number; height?: number; style?: string }
interface AiVisualLayer { id?: string; type?: string; url?: string; label?: string; animation?: string; pageNumber?: number }
interface AiSection { type?: string; title?: string; content?: Record<string, unknown>; animation?: string; [k: string]: unknown }
interface AiPage { title?: string; slug?: string; sections?: AiSection[] }
interface AiSchema {
  pages?: AiPage[]
  sections?: AiSection[]
  theme?: Record<string, unknown>
  animations?: Record<string, unknown>
  eventMetadata?: Record<string, unknown>
  povIntegration?: Record<string, unknown>
  interactiveOverlays?: AiOverlay[]
  visualLayers?: AiVisualLayer[]
  linkMapping?: Array<{ label?: string; href?: string; actionType?: string; pageNumber?: number }>
  rsvp?: { enabled?: boolean; pageCreated?: boolean; fields?: string[]; pageTitle?: string }
  warnings?: string[]
}

function coerceSectionType(t: unknown): ConvertedSectionType {
  const v = String(t ?? '').toLowerCase()
  if (v === 'canva_pdf_visual_section' || v === 'pdf_visual' || v === 'visual') return 'canva_pdf_visual_section'
  if (v === 'hero') return 'hero'
  if (v === 'about' || v === 'intro') return 'about'
  if (v === 'gallery' || v === 'image_gallery' || v === 'photos') return 'image_gallery'
  if (v === 'feature_grid' || v === 'features' || v === 'details' || v === 'grid') return 'feature_grid'
  if (v === 'cta' || v === 'rsvp' || v === 'button') return 'cta'
  return 'rich_text'
}

function buildPrompt(opts: {
  conversionStyle: ConversionStyle
  animationLevel: AnimationLevel
  povEnabled: boolean
  eventSlug: string
  extractedText: string
  extractedLinksJson: string
  renderedPagesJson: string
}): string {
  return [
    'You are converting a Canva PDF export into a fully functioning NexoraNow Invitation/Event website.',
    'Hybrid strategy: rendered PDF page images preserve visual design; you add native interactive overlays, RSVP, and working buttons.',
    '',
    'Extracted PDF text (all pages):',
    opts.extractedText.slice(0, 12000),
    '',
    'Extracted PDF link annotations:',
    opts.extractedLinksJson.slice(0, 4000),
    '',
    'Rendered page image URLs (use as canva_pdf_visual_section backgrounds):',
    opts.renderedPagesJson.slice(0, 4000),
    '',
    'Requirements:',
    '- Preserve visual design using rendered page images as canva_pdf_visual_section backgrounds where possible.',
    '- Extract and recreate clickable buttons. Map RSVP/Sign Up/Register → /events/' + opts.eventSlug + '/rsvp',
    '- Map Event Camera → /events/' + opts.eventSlug + '/camera, Gallery → /events/' + opts.eventSlug + '/gallery',
    '- If RSVP intent exists but no RSVP page, set rsvp.enabled=true and rsvp.pageCreated=true.',
    '- Do NOT leave buttons as decorative dead elements.',
    '- Recreate animation FEEL with NexoraNow presets; PDF is static — never claim exact Canva animation extraction.',
    `- Conversion style: ${opts.conversionStyle}. Animation level: ${opts.animationLevel}.`,
    opts.povEnabled ? '- POV Event Camera ENABLED: include camera + gallery CTAs.' : '- POV disabled: skip camera/gallery CTAs.',
    '',
    'Return ONLY valid minified JSON:',
    '{ "websiteType":"invitational","sourceType":"canva_pdf",',
    '  "pages":[{"title":"Home","slug":"home","sections":[...]}],',
    '  "sections":[...],',
    '  "interactiveOverlays":[{"label","actionType","href","pageNumber","style"}],',
    '  "visualLayers":[{"type","url","animation","pageNumber"}],',
    '  "linkMapping":[{"label","href","actionType","pageNumber"}],',
    '  "rsvp":{"enabled":boolean,"pageCreated":boolean,"pageTitle":string,"fields":[]},',
    '  "theme":{...},"eventMetadata":{...},',
    '  "animations":{"globalStyle":"subtle|balanced|premium_cinematic","visualLayerAnimations":[],"sectionAnimations":[]},',
    '  "warnings":[] }',
    '',
    'Section types: hero, about, image_gallery, feature_grid, cta, rich_text, canva_pdf_visual_section.',
    'canva_pdf_visual_section content: { pageNumber, renderedImageUrl, thumbnailUrl, aspectRatio, overlays[], visualLayers[] }',
  ].join('\n')
}

function buildVisualSectionsFromExtraction(
  extraction: Awaited<ReturnType<typeof extractCanvaPdfVisuals>>,
  linkMapping: MappedLink[],
  animationLevel: AnimationLevel,
): ConvertedSection[] {
  return extraction.pages
    .filter((p) => p.renderedImageUrl)
    .map((p, i) => {
      const pageLinks = linkMapping.filter((l) => l.pageNumber === p.pageNumber || !l.pageNumber)
      const overlays = pageLinks.slice(0, 8).map((l, j) => ({
        id: l.id || `overlay-${p.pageNumber}-${j}`,
        label: l.label,
        actionType: l.actionType,
        href: l.dead ? undefined : l.href,
        style: l.dead ? 'outline' as const : 'filled' as const,
      }))
      const aspectRatio = p.height && p.width ? p.height / p.width : 1.414
      const bgAnim = mapPageBackgroundAnimation(animationLevel)
      return {
        section_type: 'canva_pdf_visual_section' as const,
        section_key: `pdf-visual-page-${p.pageNumber}`,
        content: {
          type: 'canva_pdf_visual_section',
          pageNumber: p.pageNumber,
          renderedImageUrl: p.renderedImageUrl,
          thumbnailUrl: p.thumbnailUrl,
          aspectRatio,
          animationPreset: bgAnim.preset,
          overlays,
          linkMapping: pageLinks,
          visualLayers: (p.extractedImages ?? []).map((img, gi) => ({
            id: `pg${p.pageNumber}-img-${gi}`,
            type: inferVisualLayerKind(undefined, img.kind),
            url: img.publicUrl,
            animation: mapVisualLayerAnimation(inferVisualLayerKind(undefined, img.kind), animationLevel, gi),
          })),
          mobileBehavior: 'scale',
        },
        animation: buildSectionAnimation('hero', i, animationLevel),
      }
    })
}

export async function convertCanvaPdfToDraft(params: {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
}): Promise<PdfConversionResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId, websiteId, importId } = params
  const warnings: string[] = [PDF_ANIMATION_NOTE, 'Some graphics may be preserved as page visuals if individual extraction is unavailable.']

  const { data: imp } = await db.from('website_canva_imports').select('*')
    .eq('id', importId).eq('tenant_id', tenantId).maybeSingle()
  if (!imp) return { ok: false, error: 'Canva import record not found.' }
  if (!imp.pdf_storage_path) return { ok: false, error: 'No uploaded PDF found for this import.' }

  const { data: site } = await db.from('websites').select('*')
    .eq('id', websiteId).eq('tenant_id', tenantId).maybeSingle()
  if (!site) return { ok: false, error: 'Event website record not found.' }

  const summary = (imp.import_summary as Record<string, unknown>) ?? {}
  const conversionStyle = normalizeConversionStyle(summary.conversionStyle)
  const animationLevel = normalizeAnimationLevel(summary.animationRecreationLevel)
  const povEnabled = Boolean(site.pov_enabled)
  const povEventId = (site.pov_event_id as string) ?? null
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

  // Visual extraction: render pages + extract text/links
  let visualExtraction: Awaited<ReturnType<typeof extractCanvaPdfVisuals>>
  try {
    visualExtraction = await extractCanvaPdfVisuals({ pdfBuffer, tenantId, websiteId, importId })
    warnings.push(...visualExtraction.warnings)
  } catch (e) {
    visualExtraction = { pageCount: pageCount ?? 1, pages: [], warnings: [`Visual extraction failed: ${e instanceof Error ? e.message : 'error'}`], renderedPageCount: 0, extractedGraphicsCount: 0, extractedLinksCount: 0 }
    warnings.push(...visualExtraction.warnings)
  }

  const allText = visualExtraction.pages.map((p) => p.text).join('\n')
  const allPdfLinks = visualExtraction.pages.flatMap((p) => p.links ?? [])
  const rsvpDetected = detectRsvpIntent(allText) || povEnabled

  const model = getWebsiteAiGeminiModel()
  const aiParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    {
      text: buildPrompt({
        conversionStyle, animationLevel, povEnabled, eventSlug,
        extractedText: allText,
        extractedLinksJson: JSON.stringify(allPdfLinks.slice(0, 40)),
        renderedPagesJson: JSON.stringify(visualExtraction.pages.map((p) => ({ pageNumber: p.pageNumber, renderedImageUrl: p.renderedImageUrl, thumbnailUrl: p.thumbnailUrl }))),
      }),
    },
    { inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } },
  ]
  for (const p of visualExtraction.pages.slice(0, 6)) {
    if (p.renderedImageUrl) {
      try {
        const imgRes = await fetch(p.renderedImageUrl)
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer())
          aiParts.push({ inlineData: { mimeType: 'image/webp', data: buf.toString('base64') } })
        }
      } catch { /* non-fatal */ }
    }
  }

  const ai = await callGeminiMultimodal({ model, feature: 'canva-pdf-convert', temperature: 0.4, timeoutMs: 120_000, parts: aiParts })
  if (ai.error || !ai.text) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: `AI conversion failed: ${ai.error ?? 'no content returned'}` }
  }

  const parsed = safeParseGeminiJson<AiSchema>(ai.text)
  if (!parsed.data) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: `AI returned an invalid website schema: ${parsed.error ?? 'unparseable JSON'}` }
  }
  const schema = parsed.data

  const aiButtons = [
    ...(schema.linkMapping ?? []),
    ...(schema.interactiveOverlays ?? []).map((o) => ({ label: o.label, href: o.href, actionType: o.actionType, pageNumber: o.pageNumber })),
  ]
  const linkMapping = buildLinkMapping(allPdfLinks, aiButtons, { eventSlug, povEnabled })
  const deadLinks = deadLinkCount(linkMapping)
  if (deadLinks > 0) warnings.push('Some buttons need destination review.')

  const visualSections = buildVisualSectionsFromExtraction(visualExtraction, linkMapping, animationLevel)

  const aiSections: AiSection[] = []
  if (Array.isArray(schema.sections)) aiSections.push(...schema.sections)
  if (Array.isArray(schema.pages)) for (const p of schema.pages) if (Array.isArray(p.sections)) aiSections.push(...p.sections)

  const textSections: ConvertedSection[] = aiSections.slice(0, 20).map((s, i) => {
    const type = coerceSectionType(s.type)
    if (type === 'canva_pdf_visual_section') return null
    const content = (s.content && typeof s.content === 'object') ? { ...s.content } : {}
    if (s.title && !content.headline) content.headline = s.title
    if (type === 'cta' && content.ctaLabel && !content.ctaHref) {
      const mapped = linkMapping.find((l) => l.label.toLowerCase() === String(content.ctaLabel).toLowerCase())
      if (mapped && !mapped.dead) content.ctaHref = mapped.href
    }
    return {
      section_type: type,
      section_key: `pdf-ai-${i}-${type}`,
      content,
      animation: buildSectionAnimation(type, i, animationLevel, content, s.animation),
    }
  }).filter(Boolean) as ConvertedSection[]

  const homeSections: ConvertedSection[] = [...visualSections, ...textSections]

  if (povEnabled && eventSlug) {
    const camHref = `/events/${eventSlug}/camera`
    const galHref = `/events/${eventSlug}/gallery`
    if (!linkMapping.some((l) => l.actionType === 'event_camera')) {
      homeSections.push({
        section_type: 'cta', section_key: 'pov-camera',
        content: { headline: 'Capture the day from your point of view', body: 'Use your phone and PIN to add photos, clips, and audio.', ctaLabel: 'Open Event Camera', ctaHref: camHref, align: 'center' },
        animation: buildSectionAnimation('cta', homeSections.length, animationLevel),
      })
    }
    if (!linkMapping.some((l) => l.actionType === 'gallery')) {
      homeSections.push({
        section_type: 'cta', section_key: 'pov-gallery',
        content: { headline: 'Shared memories', body: 'View the event gallery once it unlocks.', ctaLabel: 'View Gallery', ctaHref: galHref, align: 'center' },
        animation: buildSectionAnimation('cta', homeSections.length, animationLevel),
      })
    }
  }

  const rsvpEnabled = schema.rsvp?.enabled ?? rsvpDetected
  const rsvpPageCreated = rsvpEnabled && (schema.rsvp?.pageCreated ?? true)
  const pages: Array<{ title: string; slug: string; sections: ConvertedSection[] }> = [
    { title: 'Home', slug: 'home', sections: homeSections },
  ]
  if (rsvpPageCreated) {
    pages.push({
      title: 'RSVP',
      slug: 'rsvp',
      sections: [{
        section_type: 'cta',
        section_key: 'rsvp-cta',
        content: {
          headline: schema.rsvp?.pageTitle ?? 'RSVP',
          body: 'Please confirm your attendance.',
          ctaLabel: 'Go to RSVP Form',
          ctaHref: `/events/${eventSlug}/rsvp`,
          align: 'center',
        },
        animation: buildSectionAnimation('cta', 0, animationLevel),
      }],
    })
  }

  if (Array.isArray(schema.warnings)) warnings.push(...schema.warnings.filter((w) => typeof w === 'string'))

  const animationMapping = buildAnimationMapping(
    homeSections.map((s) => ({ section_key: s.section_key, section_type: s.section_type, content: s.content })),
    animationLevel,
  )
  const characterAnimationCount = visualSections.reduce((n, s) => {
    const layers = (s.content.visualLayers as Array<{ animation?: { preset?: string } }>) ?? []
    return n + layers.filter((l) => l.animation?.preset?.includes('character')).length
  }, 0)

  const beforeDraft = (site.draft_config as Record<string, unknown>) ?? {}
  const now = new Date().toISOString()

  const draftConfig: Record<string, unknown> = {
    websiteType: 'invitational',
    sourceType: 'canva_pdf',
    canvaImportId: importId,
    canvaImportMode: 'converted',
    conversionStyle,
    animationLevel,
    theme: schema.theme ?? {},
    animations: schema.animations ?? { globalStyle: animationLevel, note: PDF_ANIMATION_NOTE },
    eventMetadata: schema.eventMetadata ?? {},
    povEnabled,
    povEventId,
    linkMapping,
    interactiveOverlays: schema.interactiveOverlays ?? [],
    visualExtraction: { pageCount: visualExtraction.pageCount, renderedPageCount: visualExtraction.renderedPageCount },
    rsvp: {
      enabled: rsvpEnabled,
      pageCreated: rsvpPageCreated,
      pageTitle: schema.rsvp?.pageTitle ?? 'RSVP',
      fields: schema.rsvp?.fields ?? ['name', 'email', 'phone', 'attending', 'guest_count', 'message'],
      route: `/events/${eventSlug}/rsvp`,
    },
    savedAt: now,
    pages,
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
      pdf_analysis: { textLength: allText.length, rsvpDetected },
      visual_extraction: visualExtraction,
      rendered_pages: visualExtraction.pages.map((p) => ({ pageNumber: p.pageNumber, renderedImageUrl: p.renderedImageUrl, thumbnailUrl: p.thumbnailUrl, storagePath: p.renderedStoragePath })),
      extracted_graphics: visualExtraction.pages.flatMap((p) => p.extractedImages ?? []),
      link_mapping: linkMapping,
      rsvp_mapping: draftConfig.rsvp,
      interactive_overlays: schema.interactiveOverlays ?? [],
      converted_pages: pages,
      animation_mapping: animationMapping,
      ai_conversion_summary: {
        sectionCount: homeSections.length,
        visualSectionsCount: visualSections.length,
        mappedLinksCount: linkMapping.length,
        deadLinksCount: deadLinks,
        rsvpPageCreated,
        model,
      },
      warnings,
    }).eq('id', importId)
  } catch { /* non-fatal if migration 088 not applied */ }

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
    sectionCount: homeSections.length,
    pageCount: pageCount ?? undefined,
    warnings,
    eventMetadata: schema.eventMetadata ?? {},
    animationMappingCount: animationMapping.sectionAnimations.length,
    renderedPageCount: visualExtraction.renderedPageCount,
    extractedGraphicsCount: visualExtraction.extractedGraphicsCount,
    extractedLinksCount: visualExtraction.extractedLinksCount,
    detectedButtonsCount: aiButtons.length,
    mappedLinksCount: linkMapping.length,
    deadLinksCount: deadLinks,
    rsvpDetected,
    rsvpPageCreated,
    visualSectionsCount: visualSections.length,
    characterAnimationCount,
    publishAvailable: true,
    linkMapping,
  }
}
