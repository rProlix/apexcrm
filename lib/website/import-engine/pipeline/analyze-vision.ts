// lib/website/import-engine/pipeline/analyze-vision.ts
// Gemini Vision analysis for layout reconstruction.

import 'server-only'
import { callGeminiMultimodal } from '@/lib/ai/geminiRequest'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { safeParseGeminiJson } from '@/lib/ai/parseGeminiJson'
import { buildReconstructionPrompt } from '@/lib/website/import-engine/prompts/reconstruction'
import type { DesignImportExtraction, DesignImportReconstruction } from '@/lib/website/import-engine/types'

export interface VisionAnalyzeResult {
  ok: boolean
  error?: string
  reconstruction?: DesignImportReconstruction
  tokenUsage?: Record<string, unknown>
  warnings: string[]
}

interface AiReconstructionSchema {
  detectedComponentCount?: number
  theme?: Record<string, unknown>
  pages?: Array<{
    title?: string
    slug?: string
    sections?: Array<{
      section_type?: string
      section_key?: string
      content?: Record<string, unknown>
      animation?: Record<string, unknown>
      responsive?: { desktop?: Record<string, unknown>; tablet?: Record<string, unknown>; mobile?: Record<string, unknown> }
    }>
  }>
  linkMapping?: Array<{ label?: string; href?: string; actionType?: string; dead?: boolean }>
  animations?: Record<string, unknown>
  eventMetadata?: Record<string, unknown>
  rsvp?: { enabled?: boolean; pageCreated?: boolean; pageTitle?: string; route?: string }
  warnings?: string[]
}

async function fetchImagePart(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') ?? ''
    const mimeType = ct.includes('png') ? 'image/png' : ct.includes('jpeg') || ct.includes('jpg') ? 'image/jpeg' : 'image/webp'
    return { mimeType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

function normalizeReconstruction(schema: AiReconstructionSchema, eventSlug: string): DesignImportReconstruction {
  const pages = (schema.pages ?? []).map((p, pi) => ({
    title: p.title ?? (pi === 0 ? 'Home' : `Page ${pi + 1}`),
    slug: p.slug ?? (pi === 0 ? 'home' : `page-${pi + 1}`),
    sections: (p.sections ?? [])
      .filter((s) => s.section_type && s.section_key)
      .map((s, si) => ({
        section_type: String(s.section_type),
        section_key: String(s.section_key ?? `section-${pi}-${si}`),
        content: (s.content ?? {}) as Record<string, unknown>,
        animation: s.animation,
        responsive: s.responsive,
      })),
  }))

  const linkMapping = (schema.linkMapping ?? []).map((l, i) => ({
    id: `link-${i + 1}`,
    label: String(l.label ?? 'Link'),
    href: String(l.href ?? '#'),
    actionType: l.actionType,
    dead: l.dead ?? (!l.href || l.href === '#'),
  }))

  return {
    theme: schema.theme ?? {},
    pages: pages.length > 0 ? pages : [{ title: 'Home', slug: 'home', sections: [] }],
    linkMapping,
    animations: schema.animations ?? { globalStyle: 'balanced' },
    eventMetadata: schema.eventMetadata,
    rsvp: schema.rsvp
      ? {
          enabled: schema.rsvp.enabled ?? false,
          pageCreated: schema.rsvp.pageCreated ?? false,
          pageTitle: schema.rsvp.pageTitle,
          route: schema.rsvp.route ?? `/events/${eventSlug}/rsvp`,
        }
      : undefined,
    detectedComponentCount: schema.detectedComponentCount ?? 0,
    warnings: Array.isArray(schema.warnings) ? schema.warnings.filter((w) => typeof w === 'string') : [],
  }
}

export async function analyzeWithVision(opts: {
  extraction: DesignImportExtraction
  sourceType: string
  eventSlug: string
  povEnabled: boolean
  userPrompt?: string
  attempt: number
}): Promise<VisionAnalyzeResult> {
  const warnings: string[] = []
  const model = getWebsiteAiGeminiModel()
  const prompt = buildReconstructionPrompt({
    sourceType: opts.sourceType,
    eventSlug: opts.eventSlug,
    povEnabled: opts.povEnabled,
    extraction: opts.extraction,
    userPrompt: opts.userPrompt,
    attempt: opts.attempt,
  })

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }]

  const imagePages = opts.extraction.renderedPages.slice(0, 6)
  for (const page of imagePages) {
    if (!page.publicUrl) continue
    const inline = await fetchImagePart(page.publicUrl)
    if (inline) parts.push({ inlineData: inline })
  }

  const ai = await callGeminiMultimodal({
    model,
    feature: 'design-import-engine',
    temperature: opts.attempt > 1 ? 0.45 : 0.3,
    timeoutMs: 120_000,
    parts,
  })

  if (ai.error || !ai.text) {
    warnings.push(ai.error ?? 'AI vision analysis unavailable.')
    return { ok: false, error: ai.error ?? 'AI vision analysis failed.', warnings, tokenUsage: ai.tokenUsage }
  }

  const parsed = safeParseGeminiJson<AiReconstructionSchema>(ai.text)
  if (!parsed.data) {
    warnings.push(parsed.error ?? 'AI response parse failed.')
    return { ok: false, error: 'Could not parse AI reconstruction.', warnings, tokenUsage: ai.tokenUsage }
  }

  const reconstruction = normalizeReconstruction(parsed.data, opts.eventSlug)
  if (Array.isArray(parsed.data.warnings)) {
    reconstruction.warnings.push(...parsed.data.warnings.filter((w) => typeof w === 'string'))
  }

  return { ok: true, reconstruction, tokenUsage: ai.tokenUsage, warnings }
}
