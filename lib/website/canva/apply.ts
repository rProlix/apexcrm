// lib/website/canva/apply.ts
// SERVER-ONLY. Applies a Canva import to the tenant's website draft:
//  - Preserve Mode → home page gets a safe Canva embed section + native POV CTAs.
//  - Converted Mode → home page rebuilt from converted NexoraNow sections + CTAs.
// Updates site_settings canva_* fields so publish/version/public-render carry it.
// Idempotent: removes prior canva-* sections before re-inserting.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildSafeCanvaIframe, resolveCanvaEmbedSrc } from './canva-embed'
import { convertCanvaHtml } from './convert'
import type { CanvaImportRow, CanvaImportSettings } from './types'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? `https://${ROOT_DOMAIN}`
}

export interface ApplyResult {
  ok: boolean
  mode: 'preserve' | 'converted'
  sectionsWritten: number
  warnings: string[]
  animationPreservation: 'exact' | 'approximate' | 'partial' | 'unknown'
}

export async function applyCanvaImport(params: {
  tenantId: string
  importRow: CanvaImportRow
  settings: CanvaImportSettings
  html?: string | null
  allowCustomDomains?: boolean
}): Promise<ApplyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { tenantId, importRow, settings } = params
  const allowCustomDomains = params.allowCustomDomains ?? (importRow as { validation_mode?: string }).validation_mode === 'custom_domain'
  const warnings: string[] = []

  // ── Resolve POV event slug for native CTAs ─────────────────────────────────
  let eventSlug: string | null = null
  let povEnabled = false
  try {
    const { data: s } = await db.from('site_settings').select('pov_enabled, pov_event_id').eq('tenant_id', tenantId).maybeSingle()
    povEnabled = !!s?.pov_enabled
    const eventId = importRow.pov_event_id ?? s?.pov_event_id
    if (eventId) {
      const { data: ev } = await db.from('pov_events').select('slug').eq('id', eventId).maybeSingle()
      eventSlug = ev?.slug ?? null
    }
  } catch { /* non-fatal */ }

  const cameraHref = eventSlug ? `${appBase()}/pov/${eventSlug}/camera` : ''
  const galleryHref = eventSlug ? `${appBase()}/pov/${eventSlug}/gallery` : ''

  // ── Find or create the home page ───────────────────────────────────────────
  let homeId: string | undefined
  try {
    const { data: home } = await db.from('site_pages').select('id')
      .eq('tenant_id', tenantId).eq('page_type', 'home').maybeSingle()
    homeId = home?.id
    if (!homeId) {
      const { data: created } = await db.from('site_pages').insert({
        tenant_id: tenantId, slug: '', title: 'Home', page_type: 'home', status: 'published', sort_order: 0,
      }).select('id').single()
      homeId = created?.id
    }
  } catch (e) {
    warnings.push('Could not resolve the home page for the Canva import.')
    console.warn('[canva:apply] home page error', e instanceof Error ? e.message : e)
  }
  if (!homeId) {
    return { ok: false, mode: importRow.import_mode, sectionsWritten: 0, warnings, animationPreservation: 'unknown' }
  }

  // Remove prior canva-* sections so re-apply is clean.
  try {
    await db.from('site_sections').delete().eq('page_id', homeId).like('section_key', 'canva-%')
  } catch { /* ignore */ }

  let sortBase = 0
  let written = 0
  let preservation: ApplyResult['animationPreservation'] = 'unknown'

  async function addSection(sectionType: string, sectionKey: string, content: Record<string, unknown>) {
    await db.from('site_sections').insert({
      tenant_id: tenantId, page_id: homeId, section_type: sectionType, section_key: sectionKey,
      content, sort_order: sortBase++, is_visible: true,
    })
    written++
  }

  // Resolve the safe embed src once — the public renderer reads it from
  // site_settings and renders it via <CanvaPreserveEmbed/> (no duplicate iframe
  // section, so custom-domain fallback + sandboxing work consistently).
  const embedSrc = importRow.import_mode === 'preserve'
    ? resolveCanvaEmbedSrc(importRow.source_url ?? importRow.embed_code, { allowCustomDomains })
    : null

  if (importRow.import_mode === 'preserve') {
    if (embedSrc) {
      const mode = (importRow as { validation_mode?: string }).validation_mode
      preservation = mode === 'custom_domain' ? 'partial' : 'exact'
      if (mode === 'custom_domain') {
        warnings.push('Custom domain accepted. Embedding may fail if the domain blocks iframes — a fallback "Open Canva Website" button is shown.')
      }
    } else {
      warnings.push('Could not build a safe Canva embed from the provided URL/embed code.')
      preservation = 'unknown'
    }
  } else {
    const result = convertCanvaHtml(params.html ?? '', { sourceUrl: importRow.source_url })
    for (const sec of result.sections) {
      await addSection(sec.section_type, sec.section_key, sec.content)
    }
    warnings.push(...result.warnings)
    preservation = result.preservation
  }

  // ── Native POV CTAs (outside/over Canva, never trapped in the embed) ───────
  if (povEnabled && settings.addEventCameraButton && cameraHref) {
    await addSection('cta', 'canva-cta-camera', {
      headline: 'Capture the day from your point of view',
      body: 'Use your phone number and PIN to upload photos, short clips, and audio. The gallery unlocks at the reveal time.',
      ctaLabel: 'Open Event Camera', ctaHref: cameraHref, align: 'center',
    })
  }
  if (povEnabled && settings.addGalleryButton && galleryHref) {
    await addSection('cta', 'canva-cta-gallery', {
      headline: 'The memories are developing',
      body: 'View the shared event gallery once it unlocks.',
      ctaLabel: 'View Gallery', ctaHref: galleryHref, align: 'center',
    })
  }

  // ── Persist settings so publish/version/public render carry the import ─────
  try {
    await db.from('site_settings').update({
      canva_import_enabled: true,
      canva_import_id: importRow.id,
      canva_import_mode: importRow.import_mode,
      canva_source_url: embedSrc ?? importRow.source_url,
      canva_embed_code: importRow.import_mode === 'preserve'
        ? buildSafeCanvaIframe(importRow.source_url ?? importRow.embed_code, { allowCustomDomains })
        : null,
      canva_animation_preservation: preservation,
    }).eq('tenant_id', tenantId)
  } catch (e) {
    warnings.push('Canva settings could not be saved to the site.')
    console.warn('[canva:apply] settings update error', e instanceof Error ? e.message : e)
  }

  // Mark import status.
  try {
    await db.from('website_canva_imports').update({
      status: importRow.import_mode === 'preserve' ? 'embedded' : 'converted',
      animation_preservation: preservation,
    }).eq('id', importRow.id)
  } catch { /* ignore */ }

  return { ok: true, mode: importRow.import_mode, sectionsWritten: written, warnings, animationPreservation: preservation }
}
