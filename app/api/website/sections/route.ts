// app/api/website/sections/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const url    = new URL(req.url)
  const pageId = url.searchParams.get('page_id')
  if (!pageId) return NextResponse.json({ error: 'page_id required' }, { status: 400 })

  const db = getSupabaseServerClient()

  // Verify page belongs to caller's tenant
  const { data: page } = await db
    .from('site_pages')
    .select('tenant_id')
    .eq('id', pageId)
    .maybeSingle()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== page.tenant_id) return forbidden()

  const { data, error } = await db
    .from('site_sections')
    .select('*')
    .eq('page_id', pageId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sections: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body   = await req.json()
  const pageId = body.page_id
  if (!pageId) return NextResponse.json({ error: 'page_id required' }, { status: 400 })

  const db = getSupabaseServerClient()

  const { data: page } = await db
    .from('site_pages')
    .select('tenant_id')
    .eq('id', pageId)
    .maybeSingle()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== page.tenant_id) return forbidden()

  const { section_type, section_key, content, sort_order, is_visible } = body

  if (!section_type) return NextResponse.json({ error: 'section_type required' }, { status: 422 })

  const { data, error } = await db
    .from('site_sections')
    .insert({
      tenant_id:    page.tenant_id,
      page_id:      pageId,
      section_type: section_type,
      section_key:  section_key ?? null,
      content:      content ?? {},
      sort_order:   sort_order ?? 0,
      is_visible:   is_visible ?? true,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ section: data }, { status: 201 })
}
