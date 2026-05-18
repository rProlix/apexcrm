// app/api/website/sections/move/route.ts
// Move a single section up or down by swapping sort_order with its neighbour.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json().catch(() => ({}))
  const { sectionId, direction } = body as { sectionId?: string; direction?: 'up' | 'down' }

  if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })
  if (direction !== 'up' && direction !== 'down') {
    return NextResponse.json({ error: 'direction must be "up" or "down"' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any

  // Fetch the section we're moving
  const { data: target } = await db
    .from('site_sections')
    .select('id, page_id, tenant_id, sort_order')
    .eq('id', sectionId)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
  if (ctx.role !== 'owner' && target.tenant_id !== ctx.tenant_id) return forbidden()

  // Find the adjacent section
  const { data: adjacent } = await db
    .from('site_sections')
    .select('id, sort_order')
    .eq('page_id', target.page_id)
    .eq('tenant_id', target.tenant_id)
    [direction === 'up' ? 'lt' : 'gt']('sort_order', target.sort_order)
    .order('sort_order', { ascending: direction !== 'up' })
    .limit(1)
    .maybeSingle()

  if (!adjacent) {
    return NextResponse.json({ error: 'Already at boundary', atBoundary: true })
  }

  // Swap sort_orders
  await Promise.all([
    db.from('site_sections').update({ sort_order: adjacent.sort_order }).eq('id', target.id),
    db.from('site_sections').update({ sort_order: target.sort_order }).eq('id', adjacent.id),
  ])

  return NextResponse.json({ success: true, moved: sectionId, direction })
}
