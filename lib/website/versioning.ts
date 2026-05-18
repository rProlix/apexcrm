// lib/website/versioning.ts — Server-side website versioning service
// All functions are safe to call from API routes and Server Components.
// Never throws raw DB errors to the UI.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  WebsiteSnapshot,
  WebsiteSnapshotPage,
  WebsiteSnapshotSection,
  WebsiteSnapshotImage,
  WebsiteSnapshotNavItem,
  WebsiteVersionSummary,
  WebsiteVersionFull,
  WebsiteVersionSource,
  WebsiteVersionStatus,
  CreateVersionInput,
  VersionResult,
  ClientPageSections,
} from './versionTypes'

// Cast to any — generated types don't include new site_versions/website_builder_drafts columns
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

function getDB(): DB {
  return getSupabaseServerClient() as DB
}

/**
 * Validates and returns a UUID that is safe to write to columns that
 * REFERENCE auth.users(id).  Pass ctx.auth_id — NOT ctx.id (profile UUID).
 *
 * If the value is not a valid UUID (e.g. a profile row id was passed by
 * mistake), returns null so the row still inserts without a FK violation.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeAuthUserId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return UUID_RE.test(value) ? value : null
}

// ── 1. getCurrentWebsiteSnapshot ─────────────────────────────────────────────

/**
 * Builds a complete WebsiteSnapshot from the current live site_* tables.
 *
 * Includes sections with content, style_config, animation_config, and
 * generated images from website_section_images.
 *
 * If clientPageOverride is provided, the sections for that specific page
 * are replaced with the client-provided data (captures unsaved edits
 * still in the auto-save debounce window).
 *
 * Never throws — returns structured error on failure.
 */
export async function getCurrentWebsiteSnapshot(
  tenantId: string,
  clientPageOverride?: ClientPageSections,
): Promise<VersionResult<WebsiteSnapshot>> {
  try {
    const db = getDB()

    const [settingsRes, pagesRes, navRes] = await Promise.all([
      db.from('site_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      db
        .from('site_pages')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('status', ['draft', 'published'])
        .order('sort_order', { ascending: true }),
      db
        .from('site_navigation_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true }),
    ])

    const pages: Record<string, unknown>[] = pagesRes.data ?? []
    const pageIds: string[] = pages.map((p) => p.id as string)

    // Fetch all sections from DB
    let dbSections: Record<string, unknown>[] = []
    if (pageIds.length > 0) {
      const { data } = await db
        .from('site_sections')
        .select('*')
        .in('page_id', pageIds)
        .order('sort_order', { ascending: true })
      dbSections = data ?? []
    }

    // Fetch generated images for all sections (website_section_images)
    let sectionImages: Record<string, unknown>[] = []
    if (pageIds.length > 0) {
      try {
        const { data: imgData } = await db
          .from('website_section_images')
          .select('id,section_id,image_url,public_url,storage_path,alt_text,prompt,aspect_ratio,slot_key,is_active,is_archived,metadata,created_at')
          .in('page_id', pageIds)
          .eq('is_archived', false)
          .order('created_at', { ascending: true })
        sectionImages = imgData ?? []
      } catch {
        // website_section_images table might not exist yet — degrade gracefully
        sectionImages = []
      }
    }

    // Group images by section_id
    const imagesBySectionId = sectionImages.reduce<Record<string, WebsiteSnapshotImage[]>>(
      (acc, img) => {
        const sid = img.section_id as string
        if (!acc[sid]) acc[sid] = []
        const activeImgId = sectionImages
          .filter((i) => i.section_id === sid && i.is_active === true)
          .map((i) => i.id as string)[0] ?? null
        acc[sid].push({
          id:          img.id as string,
          sectionId:   sid,
          url:         (img.image_url as string) || (img.public_url as string) || '',
          storagePath: (img.storage_path as string | null) ?? null,
          alt:         (img.alt_text as string | null) ?? null,
          prompt:      (img.prompt as string | null) ?? null,
          aspectRatio: (img.aspect_ratio as string | null) ?? null,
          slotKey:     (img.slot_key as string) ?? 'primary',
          isActive:    Boolean(img.is_active),
          metadata:    (img.metadata as Record<string, unknown>) ?? {},
          createdAt:   img.created_at as string,
        })
        // attach activeImageId on a separate pass below
        void activeImgId
        return acc
      },
      {},
    )

    // Determine active image id per section
    const activeImageIdBySectionId = sectionImages.reduce<Record<string, string | null>>(
      (acc, img) => {
        if (img.is_active === true) {
          acc[img.section_id as string] = img.id as string
        }
        return acc
      },
      {},
    )

    // Group DB sections by page_id
    const sectionsByPage = dbSections.reduce<Record<string, Record<string, unknown>[]>>(
      (acc, s) => {
        const pid = s.page_id as string
        if (!acc[pid]) acc[pid] = []
        acc[pid].push(s)
        return acc
      },
      {},
    )

    const snapshotPages: WebsiteSnapshotPage[] = pages.map((p) => {
      const pid = p.id as string

      // If client provided sections for this specific page, use those
      if (clientPageOverride && clientPageOverride.pageId === pid) {
        const clientSections = clientPageOverride.sections
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s): WebsiteSnapshotSection => ({
            id:               s.id,
            section_type:     s.section_type,
            section_key:      s.section_key ?? null,
            sort_order:       s.sort_order,
            content:          s.content ?? {},
            style_config:     s.style_config ?? null,
            animation_config: s.animation_config ?? null,
            is_visible:       s.is_visible,
            images:           imagesBySectionId[s.id] ?? [],
            activeImageId:    activeImageIdBySectionId[s.id] ?? null,
            created_at:       s.created_at ?? new Date().toISOString(),
            updated_at:       s.updated_at ?? new Date().toISOString(),
          }))

        return {
          id:               pid,
          slug:             p.slug as string,
          title:            (p.title as string | null) ?? null,
          meta_description: (p.meta_description as string | null) ?? null,
          page_type:        (p.page_type as string) ?? 'page',
          status:           (p.status as string) ?? 'draft',
          sort_order:       (p.sort_order as number) ?? 0,
          seo:              (p.seo as Record<string, unknown>) ?? {},
          sections:         clientSections,
        }
      }

      // Otherwise use DB sections for this page
      const pageSections = (sectionsByPage[pid] ?? []).map((s): WebsiteSnapshotSection => ({
        id:               s.id as string,
        section_type:     s.section_type as string,
        section_key:      (s.section_key as string | null) ?? null,
        sort_order:       (s.sort_order as number) ?? 0,
        content:          (s.content as Record<string, unknown>) ?? {},
        style_config:     (s.style_config as Record<string, unknown> | null) ?? null,
        animation_config: (s.animation_config as Record<string, unknown> | null) ?? null,
        is_visible:       (s.is_visible as boolean) ?? true,
        images:           imagesBySectionId[s.id as string] ?? [],
        activeImageId:    activeImageIdBySectionId[s.id as string] ?? null,
        created_at:       s.created_at as string,
        updated_at:       s.updated_at as string,
      }))

      return {
        id:               pid,
        slug:             p.slug as string,
        title:            (p.title as string | null) ?? null,
        meta_description: (p.meta_description as string | null) ?? null,
        page_type:        (p.page_type as string) ?? 'page',
        status:           (p.status as string) ?? 'draft',
        sort_order:       (p.sort_order as number) ?? 0,
        seo:              (p.seo as Record<string, unknown>) ?? {},
        sections:         pageSections,
      }
    })

    const snapshot: WebsiteSnapshot = {
      schemaVersion: 1,
      tenantId,
      capturedAt:    new Date().toISOString(),
      source:        'manual',
      settings:      (settingsRes.data ?? {}) as Record<string, unknown>,
      navigation:    ((navRes.data ?? []) as unknown as WebsiteSnapshotNavItem[]),
      pages:         snapshotPages,
    }

    if (process.env.NODE_ENV === 'development') {
      const totalSections = snapshotPages.reduce((sum, p) => sum + p.sections.length, 0)
      console.log(
        `[versioning] snapshot captured: ${snapshotPages.length} pages, ${totalSections} sections` +
        (clientPageOverride ? ` (page ${clientPageOverride.pageId} from client)` : ' (all from DB)'),
      )
    }

    return { data: snapshot, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[versioning] getCurrentWebsiteSnapshot error:', msg)
    return { data: null, error: msg }
  }
}

// ── 2. createWebsiteVersion ───────────────────────────────────────────────────

export async function createWebsiteVersion(
  input: CreateVersionInput,
): Promise<VersionResult<WebsiteVersionSummary>> {
  try {
    const db = getDB()

    let snapshot = input.snapshot
    if (!snapshot) {
      const snapResult = await getCurrentWebsiteSnapshot(input.tenantId)
      if (!snapResult.data) return { data: null, error: snapResult.error }
      snapshot = snapResult.data
    }

    // Recalculate counts from the actual snapshot
    const pageCount    = snapshot.pages.length
    const sectionCount = snapshot.pages.reduce((sum, p) => sum + p.sections.length, 0)

    // Get next version number via RPC
    const { data: nextNumData } = await db.rpc('get_next_site_version_number', {
      p_tenant_id: input.tenantId,
    })
    const versionNumber = (nextNumData as number | null) ?? 1

    const now = new Date().toISOString()
    const { data, error } = await db
      .from('site_versions')
      .insert({
        tenant_id:                 input.tenantId,
        version_number:            versionNumber,
        version_name:              input.label ?? null,
        label:                     input.label ?? null,
        description:               input.description ?? null,
        status:                    input.status ?? 'draft',
        source:                    input.source ?? 'manual',
        snapshot,
        page_count:                pageCount,
        section_count:             sectionCount,
        // normalizeAuthUserId guards against accidentally passing public.users.id
        // (ctx.id) instead of auth.users.id (ctx.auth_id). A wrong UUID would
        // violate the FK constraint and abort the entire insert.
        created_by:                normalizeAuthUserId(input.createdBy),
        restored_from_version_id:  input.restoredFromVersionId ?? null,
        published_at:              input.status === 'published' ? now : null,
      })
      .select('*')
      .single()

    if (error) return { data: null, error: error.message }

    // Log version event
    await db.from('website_version_events').insert({
      tenant_id:  input.tenantId,
      version_id: data.id,
      event_type: 'created',
      metadata:   {
        source:        input.source ?? 'manual',
        pageCount,
        sectionCount,
        snapshotCapturedAt: snapshot.capturedAt,
        fromClientSnapshot: !!input.snapshot,
      },
      created_by: normalizeAuthUserId(input.createdBy),
    }).then(() => null).catch(() => null) // non-blocking

    return { data: normalizeVersionRow(data) as WebsiteVersionSummary, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[versioning] createWebsiteVersion error:', msg)
    return { data: null, error: msg }
  }
}

// ── 3. getWebsiteVersions ─────────────────────────────────────────────────────

export async function getWebsiteVersions(
  tenantId: string,
  limit = 50,
): Promise<VersionResult<WebsiteVersionSummary[]>> {
  try {
    const db = getDB()
    const { data, error } = await db
      .from('site_versions')
      .select('id,tenant_id,version_number,label,version_name,description,status,source,page_count,section_count,snapshot,created_by,restored_from_version_id,published_at,created_at,updated_at')
      .eq('tenant_id', tenantId)
      .order('version_number', { ascending: false })
      .limit(limit)

    if (error) return { data: null, error: error.message }

    // Recompute counts from snapshot if stored counts are 0 but snapshot has data
    const versions = (data ?? []).map((row: Record<string, unknown>) => {
      const summary = normalizeVersionRow(row)
      if ((summary.page_count === 0 || summary.section_count === 0) && row.snapshot) {
        try {
          const snap = row.snapshot as WebsiteSnapshot
          if (snap?.pages?.length) {
            summary.page_count    = snap.pages.length
            summary.section_count = snap.pages.reduce((s, p) => s + p.sections.length, 0)
          }
        } catch { /* ignore */ }
      }
      return summary
    }) as WebsiteVersionSummary[]

    return { data: versions, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ── 4. getWebsiteVersion ──────────────────────────────────────────────────────

export async function getWebsiteVersion(
  tenantId: string,
  versionId: string,
): Promise<VersionResult<WebsiteVersionFull>> {
  try {
    const db = getDB()
    const { data, error } = await db
      .from('site_versions')
      .select('*')
      .eq('id', versionId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) return { data: null, error: error.message }
    if (!data)  return { data: null, error: 'Version not found' }

    const summary = normalizeVersionRow(data)
    const snapshot = data.snapshot as WebsiteSnapshot

    // Recompute counts if missing
    if ((summary.page_count === 0 || summary.section_count === 0) && snapshot?.pages?.length) {
      summary.page_count    = snapshot.pages.length
      summary.section_count = snapshot.pages.reduce((s, p) => s + p.sections.length, 0)
    }

    return { data: { ...summary, snapshot } as WebsiteVersionFull, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ── 5. restoreWebsiteVersion ──────────────────────────────────────────────────

export async function restoreWebsiteVersion(
  tenantId: string,
  versionId: string,
  userId: string,
): Promise<VersionResult<WebsiteVersionSummary>> {
  try {
    // 1. Load the target version
    const targetResult = await getWebsiteVersion(tenantId, versionId)
    if (!targetResult.data) return { data: null, error: targetResult.error ?? 'Version not found' }
    const targetSnapshot = targetResult.data.snapshot

    if (!targetSnapshot?.pages) {
      return { data: null, error: 'Version snapshot is invalid or empty' }
    }

    // 2. Save a "before restore" checkpoint of the current live state
    await createWebsiteVersion({
      tenantId,
      label:       `Before restoring v${targetResult.data.version_number}`,
      description: `Auto-saved before restoring to version #${targetResult.data.version_number}`,
      source:      'restore',
      status:      'autosave',
      createdBy:   userId,
    })

    // 3. Apply the target snapshot back into live tables
    const applyResult = await applySnapshotToWebsiteTables(tenantId, targetSnapshot, userId)
    if (!applyResult.data) return { data: null, error: applyResult.error ?? 'Apply failed' }

    // 4. Update the draft record to match the restored snapshot
    await updateDraftSnapshot(tenantId, targetSnapshot, userId)

    // 5. Create a new "restored" version record (history stays intact)
    const newVersionResult = await createWebsiteVersion({
      tenantId,
      label:                  `Restored from v${targetResult.data.version_number}`,
      description:            `Restored from version #${targetResult.data.version_number}`,
      source:                 'restore',
      status:                 'restored',
      createdBy:              userId,
      snapshot:               targetSnapshot,
      restoredFromVersionId:  versionId,
    })

    return newVersionResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[versioning] restoreWebsiteVersion error:', msg)
    return { data: null, error: msg }
  }
}

// ── 6. publishWebsiteVersion ──────────────────────────────────────────────────

export async function publishWebsiteVersion(
  tenantId: string,
  versionId: string,
  userId: string,
): Promise<VersionResult<WebsiteVersionSummary>> {
  try {
    const db = getDB()

    // Load the target version snapshot
    const targetResult = await getWebsiteVersion(tenantId, versionId)
    if (!targetResult.data) return { data: null, error: targetResult.error ?? 'Version not found' }
    const snap = targetResult.data.snapshot

    if (!snap?.pages) {
      return { data: null, error: 'Version snapshot is invalid or empty' }
    }

    // Apply snapshot to live tables
    const applyResult = await applySnapshotToWebsiteTables(tenantId, snap, userId)
    if (!applyResult.data) return { data: null, error: applyResult.error ?? 'Apply failed' }

    // Archive all currently published versions
    await db
      .from('site_versions')
      .update({ status: 'archived' })
      .eq('tenant_id', tenantId)
      .eq('status', 'published')

    // Mark selected version as published
    const now = new Date().toISOString()
    const { data, error } = await db
      .from('site_versions')
      .update({ status: 'published', published_at: now })
      .eq('id', versionId)
      .select('*')
      .single()

    if (error) return { data: null, error: error.message }

    // Ensure site_settings is_published = true
    await db
      .from('site_settings')
      .upsert({ tenant_id: tenantId, is_published: true }, { onConflict: 'tenant_id' })

    // Mark draft as clean
    await db
      .from('website_builder_drafts')
      .upsert(
        { tenant_id: tenantId, dirty: false, draft_snapshot: snap, base_version_id: versionId },
        { onConflict: 'tenant_id' },
      )

    // Log event (non-blocking)
    db.from('website_version_events').insert({
      tenant_id:  tenantId,
      version_id: versionId,
      event_type: 'published',
      metadata:   { published_at: now },
      created_by: normalizeAuthUserId(userId),
    }).then(() => null).catch(() => null)

    return { data: normalizeVersionRow(data) as WebsiteVersionSummary, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[versioning] publishWebsiteVersion error:', msg)
    return { data: null, error: msg }
  }
}

// ── 7. createAutosaveVersion ──────────────────────────────────────────────────

export async function createAutosaveVersion(
  tenantId: string,
  userId: string,
): Promise<VersionResult<WebsiteVersionSummary>> {
  try {
    const db = getDB()

    const snapResult = await getCurrentWebsiteSnapshot(tenantId)
    if (!snapResult.data) return { data: null, error: snapResult.error }
    const snapshot = snapResult.data

    // Skip if identical to the last autosave
    const { data: lastAutosave } = await db
      .from('site_versions')
      .select('snapshot')
      .eq('tenant_id', tenantId)
      .eq('source', 'autosave')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastAutosave?.snapshot) {
      const lastHash = simpleHash(JSON.stringify(lastAutosave.snapshot))
      const currHash = simpleHash(JSON.stringify(snapshot))
      if (lastHash === currHash) {
        return { data: null, error: null }
      }
    }

    return createWebsiteVersion({
      tenantId,
      label:     'Autosave',
      source:    'autosave',
      status:    'autosave',
      createdBy: userId,
      snapshot,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ── 8. updateDraftSnapshot ────────────────────────────────────────────────────

export async function updateDraftSnapshot(
  tenantId: string,
  snapshot: WebsiteSnapshot,
  userId: string,
): Promise<VersionResult<boolean>> {
  try {
    const db = getDB()
    const { error } = await db
      .from('website_builder_drafts')
      .upsert(
        {
          tenant_id:         tenantId,
          draft_snapshot:    snapshot,
          dirty:             true,
          last_autosaved_at: new Date().toISOString(),
          updated_by:        normalizeAuthUserId(userId),
        },
        { onConflict: 'tenant_id' },
      )

    if (error) return { data: null, error: error.message }
    return { data: true, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ── 9. getDraftSnapshot ───────────────────────────────────────────────────────

export async function getDraftSnapshot(
  tenantId: string,
): Promise<VersionResult<WebsiteSnapshot>> {
  try {
    const db = getDB()
    const { data } = await db
      .from('website_builder_drafts')
      .select('draft_snapshot, dirty')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (data?.draft_snapshot && data.dirty) {
      return { data: data.draft_snapshot as WebsiteSnapshot, error: null }
    }

    // Fall back to a fresh DB snapshot
    return getCurrentWebsiteSnapshot(tenantId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ── 10. applySnapshotToWebsiteTables ─────────────────────────────────────────

/**
 * Writes snapshot back into the live site_pages, site_sections tables.
 *
 * - Upserts pages by ID (tenant-safe)
 * - Upserts sections with content, style_config, animation_config, sort_order
 * - Soft-hides (is_visible=false) sections absent from the snapshot
 * - Never mutates rows belonging to other tenants
 * - Returns counts of applied changes
 */
export async function applySnapshotToWebsiteTables(
  tenantId: string,
  snapshot: WebsiteSnapshot,
  _userId: string,
): Promise<VersionResult<{ pagesApplied: number; sectionsApplied: number }>> {
  let pagesApplied = 0
  let sectionsApplied = 0

  try {
    const db = getDB()

    for (const page of snapshot.pages) {
      // Upsert page
      const { error: pageErr } = await db
        .from('site_pages')
        .upsert(
          {
            id:               page.id,
            tenant_id:        tenantId,
            slug:             page.slug,
            title:            page.title,
            meta_description: page.meta_description,
            page_type:        page.page_type,
            status:           page.status === 'published' ? 'published' : 'draft',
            sort_order:       page.sort_order,
          },
          { onConflict: 'id' },
        )

      if (pageErr) {
        console.error('[versioning] applySnapshot page upsert error:', pageErr.message)
        continue
      }
      pagesApplied++

      const sectionIds = page.sections.map((s) => s.id)

      // Upsert each section preserving sort_order from snapshot index
      for (let i = 0; i < page.sections.length; i++) {
        const s = page.sections[i]

        const { error: secErr } = await db
          .from('site_sections')
          .upsert(
            {
              id:               s.id,
              tenant_id:        tenantId,
              page_id:          page.id,
              section_type:     s.section_type,
              section_key:      s.section_key,
              sort_order:       i, // exact order from snapshot
              content:          s.content ?? {},
              style_config:     s.style_config ?? {},
              animation_config: s.animation_config ?? {},
              is_visible:       s.is_visible,
            },
            { onConflict: 'id' },
          )

        if (secErr) {
          console.error('[versioning] applySnapshot section upsert error:', secErr.message)
        } else {
          sectionsApplied++
        }
      }

      // Soft-hide sections no longer in snapshot
      if (sectionIds.length > 0) {
        await db
          .from('site_sections')
          .update({ is_visible: false })
          .eq('page_id', page.id)
          .eq('tenant_id', tenantId)
          .not('id', 'in', `(${sectionIds.map((id) => `'${id}'`).join(',')})`)
      } else {
        await db
          .from('site_sections')
          .update({ is_visible: false })
          .eq('page_id', page.id)
          .eq('tenant_id', tenantId)
      }
    }

    // Sync site_settings with design / template fields from snapshot settings.
    // This ensures that design_system, active_template_key, and template_config
    // written by AI restyle or template apply are preserved in the published state.
    const snapshotSettings = (snapshot.settings ?? {}) as Record<string, unknown>
    const settingsSync: Record<string, unknown> = { tenant_id: tenantId }
    if (snapshotSettings.design_system && typeof snapshotSettings.design_system === 'object') {
      settingsSync.design_system = snapshotSettings.design_system
    }
    if (snapshotSettings.theme && typeof snapshotSettings.theme === 'object') {
      settingsSync.theme = snapshotSettings.theme
    }
    if (snapshotSettings.active_template_key) {
      settingsSync.active_template_key = snapshotSettings.active_template_key
    }
    if (snapshotSettings.active_template_id) {
      settingsSync.active_template_id = snapshotSettings.active_template_id
    }
    if (snapshotSettings.template_config && typeof snapshotSettings.template_config === 'object') {
      settingsSync.template_config = snapshotSettings.template_config
    }
    if (snapshotSettings.brand_colors && typeof snapshotSettings.brand_colors === 'object') {
      settingsSync.brand_colors = snapshotSettings.brand_colors
    }
    if (snapshotSettings.fonts && typeof snapshotSettings.fonts === 'object') {
      settingsSync.fonts = snapshotSettings.fonts
    }

    if (Object.keys(settingsSync).length > 1) {
      const { error: syncErr } = await db
        .from('site_settings')
        .upsert(settingsSync, { onConflict: 'tenant_id' })
      if (syncErr) {
        console.warn('[versioning] applySnapshot settings sync failed:', syncErr.message)
      }
    }

    // Mark draft clean after apply
    await db
      .from('website_builder_drafts')
      .upsert(
        { tenant_id: tenantId, dirty: false, draft_snapshot: snapshot },
        { onConflict: 'tenant_id' },
      )

    return { data: { pagesApplied, sectionsApplied }, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[versioning] applySnapshotToWebsiteTables error:', msg)
    return { data: null, error: msg }
  }
}

// ── 11. logVersionEvent ───────────────────────────────────────────────────────

export async function logVersionEvent(
  tenantId: string,
  eventType: string,
  options: { versionId?: string; metadata?: Record<string, unknown>; createdBy?: string } = {},
): Promise<void> {
  try {
    const db = getDB()
    await db.from('website_version_events').insert({
      tenant_id:  tenantId,
      version_id: options.versionId ?? null,
      event_type: eventType,
      metadata:   options.metadata ?? {},
      created_by: normalizeAuthUserId(options.createdBy),
    })
  } catch (err) {
    console.error('[versioning] logVersionEvent error:', err instanceof Error ? err.message : err)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function normalizeVersionRow(row: Record<string, unknown>): WebsiteVersionSummary {
  return {
    id:                       row.id as string,
    tenant_id:                row.tenant_id as string,
    version_number:           (row.version_number as number | null) ?? 0,
    label:                    (row.label as string | null) ?? (row.version_name as string | null) ?? null,
    description:              (row.description as string | null) ?? null,
    status:                   (row.status as WebsiteVersionStatus) ?? 'draft',
    source:                   (row.source as WebsiteVersionSource) ?? 'manual',
    page_count:               (row.page_count as number | null) ?? 0,
    section_count:            (row.section_count as number | null) ?? 0,
    created_by:               (row.created_by as string | null) ?? null,
    restored_from_version_id: (row.restored_from_version_id as string | null) ?? null,
    published_at:             (row.published_at as string | null) ?? null,
    created_at:               row.created_at as string,
    updated_at:               (row.updated_at as string | null) ?? (row.created_at as string),
  }
}
