// app/api/owner/diagnostics/website-versioning/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { WebsiteSnapshot } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const tenantId = ctx.tenant_id
  const warnings: string[] = []

  const tables: Record<string, unknown>   = {}
  const versionInfo: Record<string, unknown> = {}
  const draftInfo: Record<string, unknown>   = {}

  // ── Check site_versions ───────────────────────────────────────────────────
  try {
    const { data, error } = await db
      .from('site_versions')
      .select('id,version_number,label,status,source,page_count,section_count,snapshot,created_at')
      .eq('tenant_id', tenantId)
      .order('version_number', { ascending: false })
      .limit(10)

    if (error) {
      tables.site_versions = `ERROR: ${error.message}`
      warnings.push(`site_versions query failed: ${error.message}`)
    } else {
      tables.site_versions = 'ok'
      const rows = (data ?? []) as Record<string, unknown>[]
      const published = rows.find((v) => v.status === 'published')
      const latest    = rows[0]

      // Check if new columns exist (migration 067)
      const hasMig067 = rows.length > 0
        ? ('version_number' in rows[0] && 'source' in rows[0])
        : 'no rows'

      versionInfo.count      = rows.length
      versionInfo.has_migration_067_columns = hasMig067
      versionInfo.published  = published
        ? {
            id:             published.id,
            version_number: published.version_number,
            label:          published.label,
            source:         published.source,
            page_count:     published.page_count,
            section_count:  published.section_count,
            created_at:     published.created_at,
          }
        : null

      if (latest) {
        const snap = latest.snapshot as WebsiteSnapshot | null
        const snapshotPageCount    = snap?.pages?.length ?? 0
        const snapshotSectionCount = snap?.pages?.reduce((s, p) => s + p.sections.length, 0) ?? 0

        versionInfo.latest = {
          id:                    latest.id,
          version_number:        latest.version_number,
          label:                 latest.label,
          source:                latest.source,
          status:                latest.status,
          stored_page_count:     latest.page_count,
          stored_section_count:  latest.section_count,
          snapshot_page_count:   snapshotPageCount,
          snapshot_section_count: snapshotSectionCount,
          created_at:            latest.created_at,
        }

        if (snapshotSectionCount === 0 && (latest.section_count as number) > 0) {
          warnings.push(`Latest version #${latest.version_number} stored count=${latest.section_count} but snapshot has 0 sections`)
        }
        if ((latest.page_count as number) === 0) {
          warnings.push(`Latest version #${latest.version_number} has page_count=0 — may be an old version without counts`)
        }
        if (snapshotPageCount === 0) {
          warnings.push(`Latest version snapshot has no pages — checkpoint may have captured empty data`)
        }
      } else {
        warnings.push('No versions found — no checkpoints have been created yet')
      }
    }
  } catch (err) {
    tables.site_versions = `EXCEPTION: ${err instanceof Error ? err.message : err}`
    warnings.push('site_versions table check threw an exception')
  }

  // ── Check website_version_events ─────────────────────────────────────────
  try {
    const { error } = await db
      .from('website_version_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1)
    tables.website_version_events = error ? `ERROR: ${error.message}` : 'ok'
    if (error) warnings.push(`website_version_events: ${error.message}`)
  } catch (err) {
    tables.website_version_events = `EXCEPTION: ${err instanceof Error ? err.message : err}`
    warnings.push('website_version_events table does not exist or is not accessible')
  }

  // ── Check website_builder_drafts ──────────────────────────────────────────
  try {
    const { data, error } = await db
      .from('website_builder_drafts')
      .select('id,dirty,last_autosaved_at,updated_at,draft_snapshot')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    tables.website_builder_drafts = error ? `ERROR: ${error.message}` : 'ok'

    if (!error) {
      if (data) {
        const snap = data.draft_snapshot as WebsiteSnapshot | null
        const draftPageCount    = snap?.pages?.length ?? 0
        const draftSectionCount = snap?.pages?.reduce((s: number, p: { sections: unknown[] }) => s + p.sections.length, 0) ?? 0

        draftInfo.exists          = true
        draftInfo.dirty           = data.dirty
        draftInfo.page_count      = draftPageCount
        draftInfo.section_count   = draftSectionCount
        draftInfo.last_autosaved_at = data.last_autosaved_at
        draftInfo.updated_at      = data.updated_at

        if (draftSectionCount === 0) {
          warnings.push('Draft exists but snapshot has 0 sections')
        }
      } else {
        draftInfo.exists = false
        warnings.push('No draft record — PUT /api/website/draft has not been called yet')
      }
    } else {
      warnings.push(`website_builder_drafts: ${error.message}`)
    }
  } catch (err) {
    tables.website_builder_drafts = `EXCEPTION: ${err instanceof Error ? err.message : err}`
    warnings.push('website_builder_drafts table does not exist — run migration 067')
  }

  // ── Check site_sections sort_order coverage ───────────────────────────────
  const sectionsInfo: Record<string, unknown> = {}
  try {
    const { data: secData } = await db
      .from('site_sections')
      .select('id,sort_order,is_visible')
      .eq('tenant_id', tenantId)

    const sections = (secData ?? []) as Record<string, unknown>[]
    const nullSortOrder  = sections.filter((s) => s.sort_order === null || s.sort_order === undefined).length
    const hiddenSections = sections.filter((s) => s.is_visible === false).length

    sectionsInfo.total            = sections.length
    sectionsInfo.null_sort_order  = nullSortOrder
    sectionsInfo.hidden           = hiddenSections
    sectionsInfo.sort_order_ok    = nullSortOrder === 0

    if (nullSortOrder > 0) {
      warnings.push(`${nullSortOrder} sections have null sort_order — run repair-counts`)
    }
    if (sections.length === 0) {
      warnings.push('No sections found — website has no content yet')
    }
  } catch (err) {
    sectionsInfo.error = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    ok:        warnings.length === 0,
    tenant_id: tenantId,
    tables,
    versions:  versionInfo,
    draft:     draftInfo,
    sections:  sectionsInfo,
    warnings,
    tips: [
      'Run POST /api/owner/diagnostics/website-versioning/repair-counts to fix stored counts',
      'Click "Create Checkpoint" in the website builder to create the first accurate version',
    ],
  })
}
