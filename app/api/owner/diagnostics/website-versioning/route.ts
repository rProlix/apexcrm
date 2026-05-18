// app/api/owner/diagnostics/website-versioning/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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

  const results: Record<string, unknown> = {
    tenant_id: tenantId,
    tables:    {},
    versions:  {},
    sections:  {},
  }

  // Check site_versions table
  try {
    const { data, error } = await db
      .from('site_versions')
      .select('id,version_number,status,source,created_at')
      .eq('tenant_id', tenantId)
      .order('version_number', { ascending: false })
      .limit(5)
    results.tables = { ...results.tables as object, site_versions: error ? `ERROR: ${error.message}` : 'ok' }

    if (!error && data) {
      const published = (data as Record<string, unknown>[]).find((v) => v.status === 'published')
      results.versions = {
        count:   data.length,
        latest:  data[0] ?? null,
        published: published ?? null,
        hasMigration067Columns: data.length > 0 ? 'version_number' in (data[0] as Record<string, unknown>) : 'no rows to check',
      }
    }
  } catch (err) {
    results.tables = { ...results.tables as object, site_versions: `EXCEPTION: ${err instanceof Error ? err.message : err}` }
  }

  // Check website_version_events
  try {
    const { error } = await db
      .from('website_version_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1)
    results.tables = { ...results.tables as object, website_version_events: error ? `ERROR: ${error.message}` : 'ok' }
  } catch (err) {
    results.tables = { ...results.tables as object, website_version_events: `EXCEPTION: ${err instanceof Error ? err.message : err}` }
  }

  // Check website_builder_drafts
  try {
    const { data, error } = await db
      .from('website_builder_drafts')
      .select('id,dirty,last_autosaved_at')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    results.tables = { ...results.tables as object, website_builder_drafts: error ? `ERROR: ${error.message}` : 'ok' }
    if (!error) results.draft = data
  } catch (err) {
    results.tables = { ...results.tables as object, website_builder_drafts: `EXCEPTION: ${err instanceof Error ? err.message : err}` }
  }

  // Check sections sort_order coverage
  try {
    const { data: secData } = await db
      .from('site_sections')
      .select('id,sort_order')
      .eq('tenant_id', tenantId)
    const sections = (secData ?? []) as Record<string, unknown>[]
    const nullSortOrder = sections.filter((s) => s.sort_order === null || s.sort_order === undefined).length
    results.sections = {
      total:          sections.length,
      with_null_sort_order: nullSortOrder,
      sort_order_ok:  nullSortOrder === 0,
    }
  } catch (err) {
    results.sections = { error: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json(results)
}
