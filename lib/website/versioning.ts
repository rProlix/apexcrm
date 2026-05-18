// lib/website/versioning.ts — Server-side website versioning service
// All functions are safe to call from API routes and Server Components.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  WebsiteSnapshot,
  WebsiteSnapshotPage,
  WebsiteSnapshotSection,
  WebsiteVersionSummary,
  WebsiteVersionFull,
  WebsiteVersionSource,
  WebsiteVersionStatus,
  CreateVersionInput,
  VersionResult,
} from './versionTypes'

// Cast to any to work around generated types not yet including new site_versions columns
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

function getDB(): DB {
  return getSupabaseServerClient() as DB
}

// ── 1. getCurrentWebsiteSnapshot ─────────────────────────────────────────────

/**
 * Builds a complete WebsiteSnapshot from the current live site_* tables.
 * Never throws — returns structured error on failure.
 */
export async function getCurrentWebsiteSnapshot(
  tenantId: string,
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

    let sections: Record<string, unknown>[] = []
    if (pageIds.length > 0) {
      const { data } = await db
        .from('site_sections')
        .select('*')
        .in('page_id', pageIds)
        .order('sort_order', { ascending: true })
      sections = data ?? []
    }

    const sectionsByPage = sections.reduce<Record<string, Record<string, unknown>[]>>(
      (acc, s) => {
        const pid = s.page_id as string
        if (!acc[pid]) acc[pid] = []
        acc[pid].push(s)
        return acc
      },
      {},
    )

    const snapshotPages: WebsiteSnapshotPage[] = pages.map((p) => ({
      id:              p.id as string,
      slug:            p.slug as string,
      title:           (p.title as string | null) ?? null,
      meta_description:(p.meta_description as string | null) ?? null,
      page_type:       (p.page_type as string) ?? 'page',
      status:          (p.status as string) ?? 'draft',
      sort_order:      (p.sort_order as number) ?? 0,
      seo:             (p.seo as Record<string, unknown>) ?? {},
      sections: (sectionsByPage[p.id as string] ?? []).map((s): WebsiteSnapshotSection => ({
        id:               s.id as string,
        section_type:     s.section_type as string,
        section_key:      (s.section_key as string | null) ?? null,
        sort_order:       (s.sort_order as number) ?? 0,
        content:          (s.content as Record<string, unknown>) ?? {},
        style_config:     (s.style_config as Record<string, unknown> | null) ?? null,
        animation_config: (s.animation_config as Record<string, unknown> | null) ?? null,
        is_visible:       (s.is_visible as boolean) ?? true,
        created_at:       s.created_at as string,
        updated_at:       s.updated_at as string,
      })),
    }))

    const snapshot: WebsiteSnapshot = {
      schemaVersion: 1,
      tenantId,
      capturedAt:    new Date().toISOString(),
      settings:      settingsRes.data ?? {},
      navigation:    navRes.data ?? [],
      pages:         snapshotPages,
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

    const pageCount    = snapshot.pages.length
    const sectionCount = snapshot.pages.reduce((sum, p) => sum + p.sections.length, 0)

    // Get next version number
    const { data: nextNumData } = await db.rpc('get_next_site_version_number', {
      p_tenant_id: input.tenantId,
    })
    const versionNumber = (nextNumData as number | null) ?? 1

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
        created_by:                input.createdBy ?? null,
        restored_from_version_id:  input.restoredFromVersionId ?? null,
        published_at:              input.status === 'published' ? new Date().toISOString() : null,
      })
      .select('*')
      .single()

    if (error) return { data: null, error: error.message }

    return { data: data as WebsiteVersionSummary, error: null }
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
      .select('id,tenant_id,version_number,label,version_name,description,status,source,page_count,section_count,created_by,restored_from_version_id,published_at,created_at,updated_at')
      .eq('tenant_id', tenantId)
      .order('version_number', { ascending: false })
      .limit(limit)

    if (error) return { data: null, error: error.message }

    const versions = (data ?? []).map(normalizeVersionRow) as WebsiteVersionSummary[]
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

    return { data: { ...normalizeVersionRow(data), snapshot: data.snapshot } as WebsiteVersionFull, error: null }
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

    // 2. Save a "before restore" checkpoint of current state
    await createWebsiteVersion({
      tenantId,
      label:      'Before restore',
      description: `Auto-saved before restoring to version #${targetResult.data.version_number}`,
      source:     'manual',
      status:     'autosave',
      createdBy:  userId,
    })

    // 3. Apply the snapshot back into live tables
    const applyResult = await applySnapshotToWebsiteTables(tenantId, targetSnapshot, userId)
    if (applyResult.error) return { data: null, error: applyResult.error }

    // 4. Create a new "restored" version record
    const newVersionResult = await createWebsiteVersion({
      tenantId,
      label:                   `Restored from v${targetResult.data.version_number}`,
      description:             `Restored from version #${targetResult.data.version_number}`,
      source:                  'restore',
      status:                  'restored',
      createdBy:               userId,
      snapshot:                targetSnapshot,
      restoredFromVersionId:   versionId,
    })

    // 5. Update draft record
    await updateDraftSnapshot(tenantId, targetSnapshot, userId)

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

    // Load the target version
    const targetResult = await getWebsiteVersion(tenantId, versionId)
    if (!targetResult.data) return { data: null, error: targetResult.error ?? 'Version not found' }

    // Apply snapshot to live tables
    const applyResult = await applySnapshotToWebsiteTables(tenantId, targetResult.data.snapshot, userId)
    if (applyResult.error) return { data: null, error: applyResult.error }

    // Archive old published versions
    await db
      .from('site_versions')
      .update({ status: 'archived' })
      .eq('tenant_id', tenantId)
      .eq('status', 'published')

    // Mark target version as published
    const now = new Date().toISOString()
    const { data, error } = await db
      .from('site_versions')
      .update({ status: 'published', published_at: now })
      .eq('id', versionId)
      .select('*')
      .single()

    if (error) return { data: null, error: error.message }

    // Mark site as published
    await db
      .from('site_settings')
      .upsert({ tenant_id: tenantId, is_published: true }, { onConflict: 'tenant_id' })

    // Log event
    await db.from('website_version_events').insert({
      tenant_id:  tenantId,
      version_id: versionId,
      event_type: 'published',
      metadata:   { published_at: now },
      created_by: userId,
    })

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

    // Get current snapshot
    const snapResult = await getCurrentWebsiteSnapshot(tenantId)
    if (!snapResult.data) return { data: null, error: snapResult.error }
    const snapshot = snapResult.data

    // Compare against last autosave to avoid duplicates
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
        return { data: null, error: null } // no meaningful changes
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
          tenant_id:       tenantId,
          draft_snapshot:  snapshot,
          dirty:           true,
          last_autosaved_at: new Date().toISOString(),
          updated_by:      userId,
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

    // Fall back to current live snapshot
    return getCurrentWebsiteSnapshot(tenantId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ── 10. applySnapshotToWebsiteTables ─────────────────────────────────────────

/**
 * Writes snapshot data back into site_pages and site_sections.
 * Upserts pages and sections by ID; removes sections absent from snapshot.
 * Never touches other tenants' data.
 */
export async function applySnapshotToWebsiteTables(
  tenantId: string,
  snapshot: WebsiteSnapshot,
  _userId: string,
): Promise<VersionResult<boolean>> {
  try {
    const db = getDB()

    for (const page of snapshot.pages) {
      // Upsert the page
      await db
        .from('site_pages')
        .upsert(
          {
            id:              page.id,
            tenant_id:       tenantId,
            slug:            page.slug,
            title:           page.title,
            meta_description: page.meta_description,
            page_type:       page.page_type,
            status:          page.status === 'published' ? 'published' : 'draft',
            sort_order:      page.sort_order,
          },
          { onConflict: 'id' },
        )

      // Determine which section IDs to keep
      const sectionIds = page.sections.map((s) => s.id)

      // Upsert each section
      for (let i = 0; i < page.sections.length; i++) {
        const s = page.sections[i]
        await db
          .from('site_sections')
          .upsert(
            {
              id:               s.id,
              tenant_id:        tenantId,
              page_id:          page.id,
              section_type:     s.section_type,
              section_key:      s.section_key,
              sort_order:       i,
              content:          s.content,
              style_config:     s.style_config ?? {},
              animation_config: s.animation_config ?? {},
              is_visible:       s.is_visible,
            },
            { onConflict: 'id' },
          )
      }

      // Soft-delete sections that are no longer in the snapshot
      if (sectionIds.length > 0) {
        await db
          .from('site_sections')
          .update({ is_visible: false })
          .eq('page_id', page.id)
          .eq('tenant_id', tenantId)
          .not('id', 'in', `(${sectionIds.map((id) => `'${id}'`).join(',')})`)
      } else {
        // No sections in snapshot for this page — hide all
        await db
          .from('site_sections')
          .update({ is_visible: false })
          .eq('page_id', page.id)
          .eq('tenant_id', tenantId)
      }
    }

    // Mark draft as clean after restore/publish
    await db
      .from('website_builder_drafts')
      .upsert(
        { tenant_id: tenantId, dirty: false, draft_snapshot: snapshot },
        { onConflict: 'tenant_id' },
      )

    return { data: true, error: null }
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
      created_by: options.createdBy ?? null,
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

function normalizeVersionRow(row: Record<string, unknown>): WebsiteVersionSummary {
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
