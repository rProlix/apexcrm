// lib/website/canva/pdfConvert.ts
// SERVER-ONLY. Converts an uploaded Canva PDF export into editable NexoraNow
// Invitation/Event website sections using the existing Website Editor AI
// provider (Gemini). The PDF is sent directly to Gemini as a document part —
// no native PDF rendering dependency is required (Vercel-safe).
//
// TRUTH: a PDF is static. We recreate animations with NexoraNow presets and
// never claim exact Canva animation extraction.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { callGeminiMultimodal } from '@/lib/ai/geminiRequest'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { safeParseGeminiJson } from '@/lib/ai/parseGeminiJson'
import {
  buildAnimationMapping, buildSectionAnimation, normalizeAnimationLevel,
  PDF_ANIMATION_NOTE, type AnimationLevel,
} from '@/lib/website/canva/pdf-animation-recreator'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

const SUPPORTED_SECTION_TYPES = ['hero', 'about', 'image_gallery', 'feature_grid', 'cta', 'rich_text'] as const
type ConvertedSectionType = (typeof SUPPORTED_SECTION_TYPES)[number]

export type ConversionStyle = 'faithful' | 'clean_premium' | 'mobile_first'

export function normalizeConversionStyle(value: unknown): ConversionStyle {
  const v = String(value ?? '').toLowerCase()
  if (v.includes('clean') || v.includes('premium')) return 'clean_premium'
  if (v.includes('mobile')) return 'mobile_first'
  return 'faithful'
}

/** Best-effort PDF page count without a PDF library (counts /Type /Page objects). */
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
}

interface AiSection { type?: string; title?: string; content?: Record<string, unknown>; animation?: string; [k: string]: unknown }
interface AiPage { title?: string; sections?: AiSection[] }
interface AiSchema {
  pages?: AiPage[]
  sections?: AiSection[]
  theme?: Record<string, unknown>
  animations?: Record<string, unknown>
  eventMetadata?: Record<string, unknown>
  povIntegration?: Record<string, unknown>
  warnings?: string[]
}

function coerceSectionType(t: unknown): ConvertedSectionType {
  const v = String(t ?? '').toLowerCase()
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
}): string {
  return [
    'You are converting a Canva PDF export into an editable NexoraNow Invitation/Event website.',
    'The attached document is a static Canva PDF export. Recreate it as responsive, mobile-first website sections.',
    '',
    'Requirements:',
    '- Preserve the visual style as closely as possible: colors, fonts (name web-safe/Google equivalents), spacing, backgrounds, imagery intent, text, section order, and the event/invitation vibe.',
    '- Convert each PDF page into one or more website sections.',
    '- Extract event copy and structure. Infer the likely event type (wedding, baby shower, birthday, graduation, anniversary, party, corporate, other).',
    `- Conversion style: ${opts.conversionStyle}.`,
    `- Animation recreation level: ${opts.animationLevel}. Recreate the FEEL of Canva motion with NexoraNow presets; do NOT claim exact Canva animations were extracted from a static PDF.`,
    opts.povEnabled
      ? '- POV Event Camera is ENABLED: include a prominent CTA section to open the Event Camera and one to view the Gallery.'
      : '- POV Event Camera is disabled: do not add camera/gallery CTAs.',
    '',
    'Return ONLY valid minified JSON (no markdown fences) matching this shape:',
    '{',
    '  "websiteType": "invitational",',
    '  "sourceType": "canva_pdf",',
    '  "sections": [ { "type": "hero|about|image_gallery|feature_grid|cta|rich_text", "title": string, "content": object, "animation": "fadeIn|fadeUp|slideInLeft|slideInRight|zoomIn|softParallax|staggerText|imageReveal|floating|subtleRotate|maskReveal|premiumBlurReveal|none" } ],',
    '  "theme": { "colors": {"background": string, "text": string, "primary": string, "accent": string}, "fonts": {"heading": string, "body": string}, "spacing": object, "borderRadius": object, "shadows": object },',
    '  "eventMetadata": { "eventType": string|null, "eventDate": string|null, "hosts": string[], "location": string|null },',
    '  "warnings": string[]',
    '}',
    '',
    'Section content guidance:',
    '- hero: { headline, subheadline, ctaLabel?, ctaHref?, backgroundImage?, align }',
    '- about: { headline, body }',
    '- feature_grid: { headline, columns, items: [{ title, description }] }',
    '- image_gallery: { headline?, images: [{ url?, alt, caption? }], layout }',
    '- cta: { headline, body, ctaLabel, ctaHref, align }',
    '- rich_text: { html }',
    'If you cannot extract an image URL, omit url and describe it in alt so it can be replaced later.',
  ].join('\n')
}

/**
 * Runs the full AI conversion for an uploaded PDF import and saves the result
 * into the event website's draft_config (config-backed site). Returns user-safe
 * diagnostics. Captures a pre-conversion snapshot so the import can be undone.
 */
export async function convertCanvaPdfToDraft(params: {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
}): Promise<PdfConversionResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId, websiteId, importId } = params
  const warnings: string[] = [PDF_ANIMATION_NOTE]

  // 1. Load import row + website.
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

  await db.from('website_canva_imports').update({ ai_conversion_status: 'analyzing', status: 'importing' }).eq('id', importId)

  // 2. Download the PDF bytes.
  const bucket = (imp.bucket as string) || 'document-assets'
  let pdfBase64: string
  let pageCount = (imp.pdf_page_count as number) ?? null
  try {
    const { data: blob, error: dlErr } = await db.storage.from(bucket).download(imp.pdf_storage_path)
    if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed')
    const arr = Buffer.from(await blob.arrayBuffer())
    pdfBase64 = arr.toString('base64')
    if (!pageCount) pageCount = estimatePdfPageCount(arr)
  } catch (e) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: `Failed to read the uploaded PDF: ${e instanceof Error ? e.message : 'storage error'}` }
  }

  // 3. Call the existing Website Editor AI (Gemini) with the PDF document part.
  const model = getWebsiteAiGeminiModel()
  const ai = await callGeminiMultimodal({
    model,
    feature: 'canva-pdf-convert',
    temperature: 0.4,
    timeoutMs: 120_000,
    parts: [
      { text: buildPrompt({ conversionStyle, animationLevel, povEnabled }) },
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
    ],
  })
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

  // 4. Flatten AI pages/sections → supported section list.
  const aiSections: AiSection[] = []
  if (Array.isArray(schema.sections)) aiSections.push(...schema.sections)
  if (Array.isArray(schema.pages)) for (const p of schema.pages) if (Array.isArray(p.sections)) aiSections.push(...p.sections)
  if (aiSections.length === 0) {
    await db.from('website_canva_imports').update({ ai_conversion_status: 'failed', status: 'failed' }).eq('id', importId)
    return { ok: false, error: 'AI conversion produced no sections from the PDF.' }
  }

  const sections: ConvertedSection[] = aiSections.slice(0, 40).map((s, i) => {
    const type = coerceSectionType(s.type)
    const content = (s.content && typeof s.content === 'object') ? { ...s.content } : {}
    if (s.title && !content.headline) content.headline = s.title
    return {
      section_type: type,
      section_key: `pdf-${i}-${type}`,
      content,
      animation: buildSectionAnimation(type, i, animationLevel, content, s.animation),
    }
  })

  // 5. Append native POV CTAs when enabled (so camera/gallery always work).
  let eventSlug: string | null = null
  if (povEnabled && povEventId) {
    try {
      const { data: ev } = await db.from('pov_events').select('slug').eq('id', povEventId).maybeSingle()
      eventSlug = ev?.slug ?? null
    } catch { /* non-fatal */ }
  }
  if (povEnabled) {
    const camHref = eventSlug ? `/events/${eventSlug}/camera` : ''
    const galHref = eventSlug ? `/events/${eventSlug}/gallery` : ''
    if (camHref) sections.push({
      section_type: 'cta', section_key: 'pov-camera',
      content: { headline: 'Capture the day from your point of view', body: 'Use your phone number and PIN to add photos, short clips, and audio. The gallery unlocks at the reveal time.', ctaLabel: 'Open Event Camera', ctaHref: camHref, align: 'center' },
      animation: buildSectionAnimation('cta', sections.length, animationLevel),
    })
    if (galHref) sections.push({
      section_type: 'cta', section_key: 'pov-gallery',
      content: { headline: 'The memories are developing', body: 'View the shared event gallery once it unlocks.', ctaLabel: 'View Gallery', ctaHref: galHref, align: 'center' },
      animation: buildSectionAnimation('cta', sections.length, animationLevel),
    })
  }

  if (Array.isArray(schema.warnings)) warnings.push(...schema.warnings.filter((w) => typeof w === 'string'))

  const animationMapping = buildAnimationMapping(
    sections.map((s) => ({ section_key: s.section_key, section_type: s.section_type, content: s.content })),
    animationLevel,
  )

  // 6. Snapshot the prior draft so the conversion can be undone.
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
    animations: { globalStyle: animationLevel, note: PDF_ANIMATION_NOTE },
    eventMetadata: schema.eventMetadata ?? {},
    povEnabled,
    povEventId,
    savedAt: now,
    pages: [{ title: 'Home', sections }],
    warnings,
  }

  // 7. Persist the converted draft to the real website record.
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

  // 8. Update the import row with conversion results.
  try {
    await db.from('website_canva_imports').update({
      status: 'converted',
      ai_conversion_status: 'converted',
      animation_preservation: 'approximate',
      pdf_page_count: pageCount,
      converted_pages: draftConfig.pages,
      converted_assets: [],
      animation_mapping: animationMapping,
      ai_conversion_summary: { sectionCount: sections.length, eventMetadata: schema.eventMetadata ?? {}, model },
      warnings,
    }).eq('id', importId)
  } catch { /* non-fatal */ }

  // 9. Trace run for undo / restore-last-published (per websiteId only).
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
    draftPreviewUrl: `/events/${site.public_slug}?preview=draft`,
    liveUrl: `/events/${site.public_slug}`,
    sectionCount: sections.length,
    pageCount: pageCount ?? undefined,
    warnings,
    eventMetadata: schema.eventMetadata ?? {},
    animationMappingCount: animationMapping.sectionAnimations.length,
  }
}
