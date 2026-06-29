// lib/website/import-engine/targets/config-event-target.ts
// Persists import engine output to config-backed event websites (draft_config).

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  DesignImportDiagnostics,
  DesignImportExtraction,
  DesignImportReconstruction,
} from '@/lib/website/import-engine/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export interface SaveConfigEventDraftParams {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
  extraction: DesignImportExtraction
  reconstruction: DesignImportReconstruction
  diagnostics: DesignImportDiagnostics
  linkMapping: unknown[]
  animationMapping: unknown
  renderedPages: unknown[]
  animationLevel: string
  povEnabled: boolean
  povEventId?: string | null
}

export interface SaveConfigEventDraftResult {
  ok: boolean
  error?: string
  draftPreviewUrl?: string
  liveUrl?: string
  eventSlug?: string
}

export async function saveConfigEventDraft(params: SaveConfigEventDraftParams): Promise<SaveConfigEventDraftResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId, websiteId, importId } = params

  const { data: site } = await db.from('websites').select('*')
    .eq('id', websiteId).eq('tenant_id', tenantId).maybeSingle()
  if (!site) return { ok: false, error: 'Event website record not found.' }

  const eventSlug = String(site.public_slug ?? '')
  const beforeDraft = (site.draft_config as Record<string, unknown>) ?? {}
  const now = new Date().toISOString()
  const warnings = [...params.diagnostics.warnings, ...params.reconstruction.warnings]

  const sections = params.reconstruction.pages.flatMap((p) =>
    p.sections.map((s) => ({
      ...s,
      animation: s.animation ?? { preset: 'fadeUp' },
    })),
  )

  const draftConfig: Record<string, unknown> = {
    websiteType: 'invitational',
    sourceType: 'canva_pdf',
    importEngine: {
      version: 1,
      sourceType: params.extraction.sourceType,
      diagnostics: params.diagnostics,
    },
    canvaImportId: importId,
    canvaImportMode: 'converted',
    animationLevel: params.animationLevel,
    theme: params.reconstruction.theme ?? {},
    eventMetadata: params.reconstruction.eventMetadata ?? {},
    povEnabled: params.povEnabled,
    povEventId: params.povEventId ?? site.pov_event_id ?? null,
    linkMapping: params.linkMapping,
    visualFirst: true,
    renderedPages: params.renderedPages,
    rsvp: params.reconstruction.rsvp ?? {
      enabled: false,
      pageCreated: false,
      pageTitle: 'RSVP',
      route: `/events/${eventSlug}/rsvp`,
    },
    savedAt: now,
    pages: params.reconstruction.pages.map((p) => ({
      title: p.title,
      slug: p.slug,
      sections: p.sections.map((s) => ({
        ...s,
        animation: s.animation ?? { preset: 'fadeUp' },
      })),
    })),
    warnings,
  }

  const newStatus = site.status === 'published' ? 'published' : 'draft'
  const { error: upErr } = await db.from('websites').update({
    draft_config: draftConfig,
    canva_import_enabled: true,
    canva_import_id: importId,
    status: newStatus,
  }).eq('id', websiteId).eq('tenant_id', tenantId)

  if (upErr) return { ok: false, error: `Failed to save converted draft: ${upErr.message}` }

  try {
    await db.from('website_canva_imports').update({
      status: 'converted',
      ai_conversion_status: 'converted',
      animation_preservation: 'approximate',
      pdf_analysis: {
        engineVersion: 1,
        sourceType: params.extraction.sourceType,
        textLength: params.extraction.text.length,
      },
      visual_extraction: {
        pageCount: params.extraction.pageCount,
        renderedPageCount: params.extraction.renderedPages.length,
      },
      rendered_pages: params.renderedPages,
      link_mapping: params.linkMapping,
      rsvp_mapping: draftConfig.rsvp,
      interactive_overlays: sections.flatMap((s) => (s.content?.overlays as unknown[]) ?? []),
      converted_pages: draftConfig.pages,
      animation_mapping: params.animationMapping,
      ai_conversion_summary: {
        engine: 'design-import-engine',
        version: 1,
        sectionsCreated: sections.length,
        confidence: params.diagnostics.confidence,
        attemptCount: params.diagnostics.attemptCount,
      },
      design_import_diagnostics: params.diagnostics,
      warnings,
    }).eq('id', importId)
  } catch { /* non-fatal if migration not applied */ }

  try {
    await db.from('website_canva_import_runs').insert({
      tenant_id: tenantId,
      business_id: null,
      website_id: websiteId,
      canva_import_id: importId,
      run_type: 'apply',
      status: 'completed',
      before_draft_snapshot: beforeDraft,
      after_draft_snapshot: draftConfig,
      warnings,
      created_by: params.createdBy ?? null,
      completed_at: now,
    })
  } catch { /* non-fatal */ }

  return {
    ok: true,
    draftPreviewUrl: `/events/${eventSlug}?preview=draft`,
    liveUrl: `/events/${eventSlug}`,
    eventSlug,
  }
}
