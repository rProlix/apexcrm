// app/api/website/sections/reorder/route.ts
// Batch-update sort_order for multiple sections in one request.
// Called by the builder after DnD reordering.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json()
  const sections: { id: string; sort_order: number }[] = body.sections ?? []

  if (!Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'sections array required' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  // Verify all sections belong to the caller's tenant (security check)
  const ids = sections.map((s) => s.id)
  const { data: existing } = await db
    .from('site_sections')
    .select('id, tenant_id')
    .in('id', ids)

  if (!existing || existing.length !== ids.length) {
    return NextResponse.json({ error: 'Some sections not found' }, { status: 404 })
  }

  for (const row of existing) {
    if (ctx.role !== 'owner' && row.tenant_id !== ctx.tenant_id) {
      return forbidden()
    }
  }

  // Batch update using individual PATCH calls (Supabase JS doesn't support bulk update elegantly)
  const updates = await Promise.allSettled(
    sections.map(({ id, sort_order }) =>
      db
        .from('site_sections')
        .update({ sort_order })
        .eq('id', id),
    ),
  )

  const failed = updates.filter((r) => r.status === 'rejected').length
  if (failed > 0) {
    return NextResponse.json(
      { error: `${failed} of ${sections.length} updates failed` },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, updated: sections.length })
}
