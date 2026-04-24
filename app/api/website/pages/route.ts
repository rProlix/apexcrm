// app/api/website/pages/route.ts
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

  const url      = new URL(req.url)
  const tenantId = resolveTenantId(ctx, url.searchParams.get('tenant_id'))
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('site_pages')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pages: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body     = await req.json()
  const tenantId = resolveTenantId(ctx, body.tenant_id)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const { slug, title, meta_description, page_type, status, sort_order } = body

  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 422 })
  if (!page_type) return NextResponse.json({ error: 'page_type is required' }, { status: 422 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('site_pages')
    .insert({
      tenant_id:       tenantId,
      slug:            slug.replace(/^\//, '').toLowerCase().trim(),
      title:           title ?? null,
      meta_description: meta_description ?? null,
      page_type:       page_type ?? 'custom',
      status:          status ?? 'draft',
      sort_order:      sort_order ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A page with that slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ page: data }, { status: 201 })
}
