// app/api/website/sections/[sectionId]/route.ts
// PATCH — update a section's content, visibility, sort order, or type.
// DELETE — permanently delete a section.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ sectionId: string }>
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function resolveOwnership(
  ctx: Awaited<ReturnType<typeof getUserContext>>,
  sectionId: string,
) {
  if (!ctx) return null
  const db = getSupabaseServerClient()
  const { data } = await db
    .from('site_sections')
    .select('tenant_id')
    .eq('id', sectionId)
    .maybeSingle()

  if (!data) return null
  if (ctx.role === 'owner') return data.tenant_id
  if (ctx.tenant_id === data.tenant_id) return data.tenant_id
  return null
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { sectionId } = await context.params

  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = await resolveOwnership(ctx, sectionId)
  if (!tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body    = await req.json()
  const allowed = ['content', 'sort_order', 'is_visible', 'section_type', 'section_key', 'style_config', 'animation_config']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  // When style_config is a partial update containing only `design`, merge with existing
  // so we don't accidentally erase animation data already stored in style_config.animation.
  if (patch.style_config && typeof patch.style_config === 'object') {
    const incoming = patch.style_config as Record<string, unknown>
    // Only do a merge-load if the patch is a style_config sub-key update (not a full replace)
    // We detect this by checking if it's missing normal top-level keys
    const isPartialDesignUpdate = 'design' in incoming && Object.keys(incoming).length <= 3
    if (isPartialDesignUpdate) {
      const db2 = getSupabaseServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (db2.from('site_sections') as any)
        .select('style_config')
        .eq('id', sectionId)
        .maybeSingle() as { data: { style_config?: Record<string, unknown> } | null; error: unknown }
      const existingSc = (existing?.style_config && typeof existing.style_config === 'object')
        ? existing.style_config as Record<string, unknown>
        : {}
      patch.style_config = { ...existingSc, ...incoming }
    }
  }

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('site_sections') as any)
    .update(patch)
    .eq('id', sectionId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ section: data })
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { sectionId } = await context.params

  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = await resolveOwnership(ctx, sectionId)
  if (!tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const db = getSupabaseServerClient()
  const { error } = await db
    .from('site_sections')
    .delete()
    .eq('id', sectionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
