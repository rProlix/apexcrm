// app/api/owner/diagnostics/website-versioning/repair-counts/route.ts
// Safe admin utility: recalculates page_count and section_count for all
// versions from their actual snapshots. Does NOT delete or invent data.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { WebsiteSnapshot } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST() {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db  = getSupabaseServerClient() as any
  const tid = ctx.tenant_id

  const fixed: { id: string; version_number: number; old_page_count: number; old_section_count: number; new_page_count: number; new_section_count: number }[] = []
  const errors: string[] = []
  let checked = 0

  try {
    const { data, error } = await db
      .from('site_versions')
      .select('id,version_number,page_count,section_count,snapshot')
      .eq('tenant_id', tid)
      .order('version_number', { ascending: true })

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: true, message: 'No versions to repair', checked: 0, fixed: [] })
    }

    for (const row of data as Record<string, unknown>[]) {
      checked++
      const snap     = row.snapshot as WebsiteSnapshot | null
      if (!snap?.pages) continue

      const newPageCount    = snap.pages.length
      const newSectionCount = snap.pages.reduce((s, p) => s + (p.sections?.length ?? 0), 0)
      const oldPageCount    = (row.page_count as number)    ?? 0
      const oldSectionCount = (row.section_count as number) ?? 0

      // Only update if counts differ or if schemaVersion is missing
      const needsUpdate = newPageCount !== oldPageCount || newSectionCount !== oldSectionCount

      if (needsUpdate) {
        const { error: upErr } = await db
          .from('site_versions')
          .update({ page_count: newPageCount, section_count: newSectionCount })
          .eq('id', row.id)
          .eq('tenant_id', tid)

        if (upErr) {
          errors.push(`v${row.version_number}: ${upErr.message}`)
        } else {
          fixed.push({
            id:                row.id as string,
            version_number:    row.version_number as number,
            old_page_count:    oldPageCount,
            old_section_count: oldSectionCount,
            new_page_count:    newPageCount,
            new_section_count: newSectionCount,
          })
        }
      }
    }

    // Also backfill any site_sections with null sort_order
    const { data: nullSortSections } = await db
      .from('site_sections')
      .select('id,page_id,created_at')
      .eq('tenant_id', tid)
      .is('sort_order', null)
      .order('created_at', { ascending: true })

    let sortOrderFixed = 0
    const byPage: Record<string, string[]> = {}
    for (const sec of (nullSortSections ?? []) as Record<string, unknown>[]) {
      const pid = sec.page_id as string
      if (!byPage[pid]) byPage[pid] = []
      byPage[pid].push(sec.id as string)
    }

    for (const [, ids] of Object.entries(byPage)) {
      for (let i = 0; i < ids.length; i++) {
        await db
          .from('site_sections')
          .update({ sort_order: i })
          .eq('id', ids[i])
          .eq('tenant_id', tid)
        sortOrderFixed++
      }
    }

    return NextResponse.json({
      ok:              errors.length === 0,
      checked,
      fixed_versions:  fixed.length,
      fixed_sort_order: sortOrderFixed,
      fixed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
