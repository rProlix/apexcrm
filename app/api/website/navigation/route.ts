// app/api/website/navigation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function resolveTenantId(
  ctx:   Awaited<ReturnType<typeof getUserContext>>,
  hint?: string | null,
): string | null {
  if (!ctx) return null
  const hintClean = sanitizeTenantId(hint)
  const self      = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hintClean ?? self
  if (self && hintClean && self !== hintClean) return null
  return self ?? hintClean
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const url = new URL(req.url)
  const tid = resolveTenantId(ctx, url.searchParams.get('tenant_id'))
  if (!tid) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('site_navigation_items')
    .select('*')
    .eq('tenant_id', tid)
    .order('location')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json()
  const tid  = resolveTenantId(ctx, body.tenant_id)
  if (!tid) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const { label, href, location, sort_order, is_visible } = body
  if (!label || !href) return NextResponse.json({ error: 'label and href required' }, { status: 422 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('site_navigation_items')
    .insert({
      tenant_id:  tid,
      label:      label.trim(),
      href:       href.trim(),
      location:   location ?? 'header',
      sort_order: sort_order ?? 0,
      is_visible: is_visible ?? true,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getSupabaseServerClient()

  // Verify ownership
  const { data: existing } = await db
    .from('site_navigation_items')
    .select('tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id && ctx.tenant_id !== existing.tenant_id) return forbidden()

  const allowed = ['label', 'href', 'location', 'sort_order', 'is_visible']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) patch[key] = rest[key]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('site_navigation_items') as any)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getSupabaseServerClient()

  const { data: existing } = await db
    .from('site_navigation_items')
    .select('tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id && ctx.tenant_id !== existing.tenant_id) return forbidden()

  const { error } = await db.from('site_navigation_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
