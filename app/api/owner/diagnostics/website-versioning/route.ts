// app/api/owner/diagnostics/website-versioning/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createWebsiteSnapshotForTenant } from '@/lib/website/snapshot/createWebsiteSnapshotForTenant'
import type { WebsiteSnapshot } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const runTest = searchParams.get('test') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db        = getSupabaseServerClient() as any
  const tenantId  = ctx.tenant_id
  const warnings: string[] = []

  const tables:  Record<string, unknown> = {}
  const versions: Record<string, unknown> = {}
  const draft:   Record<string, unknown> = {}
  const sections: Record<string, unknown> = {}

  // ── site_versions ────────────────────────────────────────────────────────
  try {
    const { data, error } = await db
      .from('site_versions')
      .select('id,version_number,label,status,source,page_count,section_count,snapshot,created_at')
      .eq('tenant_id', tenantId)
      .order('version_number', { ascending: false })
      .limit(10)

    if (error) {
      tables.site_versions = `ERROR: ${error.message}`
      warnings.push(`site_versions: ${error.message}`)
    } else {
      const rows = (data ?? []) as Record<string, unknown>[]
      const published = rows.find((v) => v.status === 'published')
      const latest    = rows[0]
      const hasNewColumns = rows.length > 0
        ? 'version_number' in rows[0] && 'source' in rows[0]
        : null

      tables.site_versions = {
        exists:      true,
        count:       rows.length,
        has_migration_068_columns: hasNewColumns,
      }

      // Check constraint values
      const { data: srcCheck } = await db
        .from('site_versions')
        .select('source')
        .eq('tenant_id', tenantId)
        .in('source', ['ai_animations', 'auto', 'system'])
        .limit(1)
      tables.site_versions = {
        ...(tables.site_versions as object),
        new_source_values_accessible: srcCheck !== null,
      }

      if (latest) {
        const snap  = latest.snapshot as WebsiteSnapshot | null
        const spages = snap?.pages?.length ?? 0
        const ssec   = snap?.pages?.reduce((s, p) => s + (p.sections?.length ?? 0), 0) ?? 0

        versions.latest = {
          id:                     latest.id,
          version_number:         latest.version_number,
          label:                  latest.label,
          source:                 latest.source,
          status:                 latest.status,
          stored_page_count:      latest.page_count,
          stored_section_count:   latest.section_count,
          snapshot_page_count:    spages,
          snapshot_section_count: ssec,
          created_at:             latest.created_at,
        }

        if (ssec === 0 && (latest.section_count as number) > 0) {
          warnings.push(`Latest v${latest.version_number}: stored section_count=${latest.section_count} but snapshot has 0 sections`)
        }
        if (spages === 0) warnings.push(`Latest v${latest.version_number}: snapshot has no pages`)
      } else {
        warnings.push('No versions exist yet')
      }

      versions.published = published
        ? { id: published.id, version_number: published.version_number, status: 'published' }
        : null
    }
  } catch (err) {
    tables.site_versions = `EXCEPTION: ${err instanceof Error ? err.message : err}`
    warnings.push('site_versions exception — table may not exist')
  }

  // ── website_version_events ────────────────────────────────────────────────
  try {
    const { error } = await db
      .from('website_version_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1)
    tables.website_version_events = error ? `ERROR: ${error.message}` : { exists: true }
    if (error) warnings.push(`website_version_events: ${error.message}`)
  } catch (err) {
    tables.website_version_events = `EXCEPTION: ${err instanceof Error ? err.message : err}`
    warnings.push('website_version_events table may be missing — run migration 067/068')
  }

  // ── website_builder_drafts ────────────────────────────────────────────────
  try {
    const { data, error } = await db
      .from('website_builder_drafts')
      .select('id,dirty,last_autosaved_at,updated_at,draft_snapshot')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) {
      tables.website_builder_drafts = `ERROR: ${error.message}`
      warnings.push(`website_builder_drafts: ${error.message}`)
    } else {
      tables.website_builder_drafts = { exists: true }
      if (data) {
        const snap = data.draft_snapshot as WebsiteSnapshot | null
        const dp = snap?.pages?.length ?? 0
        const ds = snap?.pages?.reduce((s: number, p: { sections: unknown[] }) => s + p.sections.length, 0) ?? 0
        draft.exists        = true
        draft.dirty         = data.dirty
        draft.page_count    = dp
        draft.section_count = ds
        draft.updated_at    = data.updated_at
        draft.last_autosaved_at = data.last_autosaved_at
        if (ds === 0) warnings.push('Draft snapshot has 0 sections')
      } else {
        draft.exists = false
        warnings.push('No draft record — PUT /api/website/draft has not been called yet')
      }
    }
  } catch (err) {
    tables.website_builder_drafts = `EXCEPTION: ${err instanceof Error ? err.message : err}`
    warnings.push('website_builder_drafts missing — run migration 067/068')
  }

  // ── site_sections coverage ────────────────────────────────────────────────
  try {
    const { data: secData } = await db
      .from('site_sections')
      .select('id,sort_order,is_visible')
      .eq('tenant_id', tenantId)
    const secs = (secData ?? []) as Record<string, unknown>[]
    sections.total           = secs.length
    sections.null_sort_order = secs.filter((s) => s.sort_order === null).length
    sections.hidden          = secs.filter((s) => s.is_visible === false).length
    if ((sections.null_sort_order as number) > 0) {
      warnings.push(`${sections.null_sort_order} sections have null sort_order — run repair-counts`)
    }
    if (secs.length === 0) warnings.push('No sections in site_sections — website has no content')
  } catch (err) {
    sections.error = err instanceof Error ? err.message : String(err)
  }

  // ── Optional: dry-run snapshot test ──────────────────────────────────────
  let snapshotTest: Record<string, unknown> | null = null
  if (runTest) {
    const snapResult = await createWebsiteSnapshotForTenant({
      tenantId,
      userId:  ctx.id,
      source:  'manual',
    })
    if (snapResult.ok) {
      snapshotTest = {
        ok:           true,
        pageCount:    snapResult.pageCount,
        sectionCount: snapResult.sectionCount,
        estimatedKb:  Math.round(snapResult.estimatedKb * 10) / 10,
        fromClient:   snapResult.fromClient,
        warnings:     snapResult.warnings,
        message:      'Snapshot would be valid for checkpoint insertion',
      }
    } else {
      snapshotTest = {
        ok:      false,
        error:   snapResult.error,
        details: snapResult.details,
        step:    snapResult.step,
      }
      warnings.push(`Snapshot test failed at step "${snapResult.step}": ${snapResult.error}`)
    }
  }

  return NextResponse.json({
    ok:          warnings.length === 0,
    tenant_id:   tenantId,
    user_role:   ctx.role,
    tables,
    versions,
    draft,
    sections,
    warnings,
    snapshot_test: snapshotTest,
    tips: [
      'Add ?test=true to run a dry-run snapshot build without inserting',
      'Run POST /api/owner/diagnostics/website-versioning/repair-counts to fix counts',
      'Run POST /api/website/versions/test to validate snapshot before creating checkpoint',
    ],
  })
}
