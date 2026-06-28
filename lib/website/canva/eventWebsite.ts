// lib/website/canva/eventWebsite.ts
// SERVER-ONLY. A Canva import becomes a REAL, separately-publishable
// Invitation/Event website record (source='config') whose draft + published
// content live on the websites row. It never touches the business builder site.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { validateCanvaEmbedInput, resolveCanvaEmbedSrc, buildSafeCanvaIframe } from '@/lib/website/canva/canva-embed'
import { normalizeSlug, validateSlug, RESERVED_NAMES } from '@/lib/website/registry'
import type { CanvaImportMode, CanvaImportSettings } from '@/lib/website/canva/types'
import { DEFAULT_CANVA_IMPORT_SETTINGS } from '@/lib/website/canva/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

export interface CanvaEventWebsiteRef {
  websiteId: string
  publicSlug: string
  draftPreviewUrl: string
  liveUrl: string
  status: string
}

function eventUrls(slug: string): { publicUrl: string; draftPreviewUrl: string } {
  return { publicUrl: `/events/${slug}`, draftPreviewUrl: `/events/${slug}?preview=draft` }
}

async function uniqueSlug(db: DB, tenantId: string, base: string): Promise<string> {
  let slug = normalizeSlug(base) || 'event'
  if (RESERVED_NAMES.has(slug) || slug.length < 3) slug = `event-${slug}`.slice(0, 60)
  let candidate = slug
  for (let i = 0; i < 6; i++) {
    const { data } = await db.from('websites').select('id')
      .eq('tenant_id', tenantId).eq('public_slug', candidate).maybeSingle()
    if (!data) return candidate
    candidate = `${slug}-${Math.random().toString(36).slice(2, 6)}`
  }
  return candidate
}

/**
 * Ensures a real Invitation/Event website record exists for a Canva import.
 * Reuses websiteId when given; otherwise creates a draft config-backed record.
 */
export async function ensureCanvaEventWebsiteRecord(params: {
  tenantId: string
  websiteId?: string | null
  name?: string | null
  slug?: string | null
  povEnabled?: boolean
  povEventId?: string | null
  createdBy?: string | null
}): Promise<{ ref?: CanvaEventWebsiteRef; error?: string }> {
  const db = getSupabaseServerClient() as DB
  const { tenantId } = params

  if (params.websiteId) {
    const { data } = await db.from('websites').select('*')
      .eq('tenant_id', tenantId).eq('id', params.websiteId).maybeSingle()
    if (!data) return { error: 'Website not found for this account.' }
    const urls = eventUrls(data.public_slug as string)
    return { ref: { websiteId: data.id, publicSlug: data.public_slug, status: data.status, ...urls, liveUrl: urls.publicUrl } }
  }

  // Validate an explicit slug if one was requested.
  if (params.slug) {
    const norm = normalizeSlug(params.slug)
    const invalid = validateSlug(norm)
    if (invalid) return { error: invalid }
  }

  const name = (params.name && params.name.trim()) || 'Imported Canva Event Website'
  const slug = await uniqueSlug(db, tenantId, params.slug || name)

  const { data: row, error } = await db.from('websites').insert({
    tenant_id: tenantId,
    website_type: 'invitational',
    source: 'config',
    name,
    public_slug: slug,
    status: 'draft',
    canva_import_enabled: true,
    pov_enabled: Boolean(params.povEnabled),
    pov_event_id: params.povEventId ?? null,
    draft_config: {},
    created_by: params.createdBy ?? null,
  }).select('*').single()

  if (error || !row) return { error: error?.message ?? 'Could not create the event website record.' }

  const urls = eventUrls(slug)
  return { ref: { websiteId: row.id, publicSlug: slug, status: 'draft', ...urls, liveUrl: urls.publicUrl } }
}

export interface SaveCanvaDraftInput {
  tenantId: string
  websiteId?: string | null
  name?: string | null
  slug?: string | null
  sourceType: string
  importMode: CanvaImportMode
  canvaUrl?: string | null
  embedCode?: string | null
  isCustomDomain?: boolean
  settings?: Partial<CanvaImportSettings>
  povEnabled?: boolean
  povEventId?: string | null
  createdBy?: string | null
}

export interface SaveCanvaDraftResult {
  ok: boolean
  error?: string
  websiteId?: string
  publicSlug?: string
  status?: string
  draftPreviewUrl?: string
  liveUrl?: string
  importId?: string
  warnings?: string[]
  draftConfig?: Record<string, unknown>
}

/**
 * Saves a Canva import into the event website's DRAFT content (draft_config) —
 * not just local state or a URL. Creates the record + import row if needed.
 */
export async function saveCanvaEventDraft(input: SaveCanvaDraftInput): Promise<SaveCanvaDraftResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId } = input
  const warnings: string[] = []

  // 1. Validate the Canva source for preserve mode (real, specific errors).
  let validationMode: string | null = null
  let sourceDomain: string | null = null
  if (input.importMode === 'preserve') {
    const validation = validateCanvaEmbedInput(input.canvaUrl ?? input.embedCode, { allowCustomDomains: Boolean(input.isCustomDomain) })
    if (!validation.ok) {
      return { ok: false, error: validation.reason ?? 'Enter a valid Canva published URL, canva.site link, or embed code.' }
    }
    sourceDomain = validation.hostname ?? null
    validationMode = validation.validationMode ?? null
  } else if (input.importMode !== 'converted') {
    return { ok: false, error: 'Invalid import mode.' }
  }

  // 2. Ensure the real website record exists.
  const ensured = await ensureCanvaEventWebsiteRecord({
    tenantId, websiteId: input.websiteId, name: input.name, slug: input.slug,
    povEnabled: input.povEnabled, povEventId: input.povEventId, createdBy: input.createdBy,
  })
  if (!ensured.ref) return { ok: false, error: ensured.error ?? 'Could not create the event website record.' }
  const websiteId = ensured.ref.websiteId

  // 3. Load the current draft so undo can restore it later.
  const { data: current } = await db.from('websites').select('draft_config, status').eq('id', websiteId).maybeSingle()
  const beforeDraft = (current?.draft_config as Record<string, unknown>) ?? {}

  // 4. Create the website_canva_imports row (audit + diagnostics).
  const allowCustom = validationMode === 'custom_domain'
  let importId: string | null = null
  try {
    const { data: imp, error: impErr } = await db.from('website_canva_imports').insert({
      tenant_id: tenantId,
      business_id: null,
      website_id: websiteId,
      pov_event_id: input.povEventId ?? null,
      source_type: input.sourceType,
      import_mode: input.importMode,
      source_url: input.canvaUrl ?? null,
      embed_code: input.embedCode ?? null,
      source_domain: sourceDomain,
      is_custom_domain: allowCustom,
      validation_mode: validationMode,
      status: input.importMode === 'preserve' ? 'embedded' : 'converted',
      import_summary: { settings: input.settings ?? {}, sourceDomain, canvaValidationMode: validationMode },
      warnings: [],
      created_by: input.createdBy ?? null,
    }).select('id').single()
    if (impErr) return { ok: false, error: `Failed to create Canva import row: ${impErr.message}` }
    importId = imp?.id ?? null
  } catch (e) {
    return { ok: false, error: `Failed to create Canva import row: ${e instanceof Error ? e.message : 'database error'}` }
  }

  // 5. Resolve the safe embed src + iframe.
  const embedUrl = input.importMode === 'preserve'
    ? resolveCanvaEmbedSrc(input.canvaUrl ?? input.embedCode, { allowCustomDomains: allowCustom })
    : null
  if (input.importMode === 'preserve' && !embedUrl) {
    warnings.push('Could not build a safe Canva embed from the provided URL/embed code.')
  }
  const preservation: 'exact' | 'partial' | 'unknown' =
    input.importMode === 'preserve' ? (allowCustom ? 'partial' : (embedUrl ? 'exact' : 'unknown')) : 'partial'
  if (allowCustom) warnings.push('Custom domain accepted. Embedding may fail if the domain blocks iframes — a fallback "Open Canva Website" button is shown.')

  const settings: CanvaImportSettings = { ...DEFAULT_CANVA_IMPORT_SETTINGS, ...(input.settings ?? {}) }

  // 6. Build the draft config (the real website draft content the renderer uses).
  const now = new Date().toISOString()
  const draftConfig: Record<string, unknown> = {
    websiteType: 'invitational',
    canvaImportEnabled: true,
    canvaImportId: importId,
    canvaImportMode: input.importMode,
    canvaSourceUrl: input.canvaUrl ?? null,
    canvaEmbedCode: input.importMode === 'preserve'
      ? buildSafeCanvaIframe(input.canvaUrl ?? input.embedCode, { allowCustomDomains: allowCustom })
      : null,
    canvaAnimationPreservation: preservation,
    povEnabled: Boolean(input.povEnabled),
    povEventId: input.povEventId ?? null,
    embedUrl,
    savedAt: now,
    pages: [
      {
        type: 'canva_embed',
        title: 'Home',
        sections: [
          {
            type: 'canva_embed',
            canvaImportId: importId,
            sourceUrl: input.canvaUrl ?? null,
            embedUrl,
            importMode: input.importMode,
            overlayActions: {
              showEventCamera: Boolean(input.povEnabled) && settings.addEventCameraButton,
              showGallery: Boolean(input.povEnabled) && settings.addGalleryButton,
              showLogin: Boolean(input.povEnabled),
            },
          },
        ],
      },
    ],
  }

  // 7. Persist draft to the real website record.
  const { data: wasPublished } = await db.from('websites').select('status, published_at').eq('id', websiteId).maybeSingle()
  const newStatus = wasPublished?.status === 'published' ? 'published' : 'draft'
  const { error: upErr } = await db.from('websites').update({
    draft_config: draftConfig,
    canva_import_enabled: true,
    canva_import_id: importId,
    status: newStatus,
  }).eq('tenant_id', tenantId).eq('id', websiteId)
  if (upErr) return { ok: false, error: `Failed to save draft config: ${upErr.message}` }

  // 8. Trace the change so Undo can restore the prior draft.
  try {
    await db.from('website_canva_import_runs').insert({
      tenant_id: tenantId, business_id: null, website_id: websiteId, canva_import_id: importId,
      run_type: 'apply', status: 'completed',
      before_draft_snapshot: beforeDraft, after_draft_snapshot: draftConfig,
      warnings, created_by: input.createdBy ?? null, completed_at: now,
    })
  } catch { /* non-fatal */ }

  const urls = eventUrls(ensured.ref.publicSlug)
  return {
    ok: true, websiteId, publicSlug: ensured.ref.publicSlug, status: newStatus,
    draftPreviewUrl: urls.draftPreviewUrl, liveUrl: urls.publicUrl,
    importId: importId ?? undefined, warnings, draftConfig,
  }
}

export interface ConfigRollbackResult { ok: boolean; error?: string; restored?: string; status?: string }

/** Undo (restore prior draft) or restore-last-published for a config event site. */
export async function rollbackCanvaEventWebsite(params: {
  tenantId: string
  websiteId: string
  action: 'undo' | 'restore-last-published'
}): Promise<ConfigRollbackResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId, websiteId } = params

  const { data: site } = await db.from('websites').select('*').eq('tenant_id', tenantId).eq('id', websiteId).maybeSingle()
  if (!site) return { ok: false, error: 'Website not found.' }

  if (params.action === 'restore-last-published') {
    if (!site.published_config) return { ok: false, error: 'No published version exists to restore yet.' }
    const { error } = await db.from('websites').update({ draft_config: site.published_config }).eq('id', websiteId).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, restored: 'last_published', status: site.status }
  }

  // Undo: restore the most recent run's before_draft_snapshot.
  const { data: run } = await db.from('website_canva_import_runs').select('*')
    .eq('tenant_id', tenantId).eq('website_id', websiteId).eq('status', 'completed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!run || run.before_draft_snapshot == null) return { ok: false, error: 'Nothing to undo yet.' }

  const { error } = await db.from('websites')
    .update({ draft_config: run.before_draft_snapshot })
    .eq('id', websiteId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }

  try {
    await db.from('website_canva_import_runs').update({ status: 'undone', completed_at: new Date().toISOString() }).eq('id', run.id)
  } catch { /* non-fatal */ }

  return { ok: true, restored: 'pre_import_draft', status: site.status }
}

export interface PublicEventWebsite {
  id: string
  tenant_id: string
  name: string
  public_slug: string
  status: string
  pov_enabled: boolean
  pov_event_id: string | null
  config: Record<string, unknown> | null
  isDraftPreview: boolean
}

/**
 * Public resolver for a config-backed Canva event website by slug.
 * Returns published_config for visitors; draft_config when an authorized editor
 * requests a draft preview. Returns null when no config event site matches.
 */
export async function resolvePublicEventWebsite(
  slug: string,
  opts?: { preview?: boolean; canPreview?: boolean },
): Promise<PublicEventWebsite | null> {
  const db = getSupabaseServerClient() as DB
  const { data } = await db.from('websites').select('*')
    .eq('public_slug', slug).eq('source', 'config').limit(1).maybeSingle()
  if (!data) return null

  const wantDraft = Boolean(opts?.preview && opts?.canPreview)
  const config = wantDraft
    ? ((data.draft_config as Record<string, unknown>) ?? null)
    : ((data.published_config as Record<string, unknown>) ?? null)

  return {
    id: data.id,
    tenant_id: data.tenant_id,
    name: data.name,
    public_slug: data.public_slug,
    status: data.status,
    pov_enabled: Boolean(data.pov_enabled),
    pov_event_id: data.pov_event_id ?? null,
    config,
    isDraftPreview: wantDraft,
  }
}

export { ROOT_DOMAIN as EVENT_ROOT_DOMAIN }
