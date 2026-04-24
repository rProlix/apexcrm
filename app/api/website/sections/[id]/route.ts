// app/api/website/sections/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = await resolveOwnership(ctx, (await params).id)
  if (!tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body    = await req.json()
  const allowed = ['content', 'sort_order', 'is_visible', 'section_type', 'section_key']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('site_sections') as any)
    .update(patch)
    .eq('id', (await params).id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ section: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = await resolveOwnership(ctx, (await params).id)
  if (!tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const db = getSupabaseServerClient()
  const { error } = await db
    .from('site_sections')
    .delete()
    .eq('id', (await params).id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
