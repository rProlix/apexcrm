// app/api/website/3d-assets/route.ts
// List (GET) and delete (DELETE) Premium 3D Scroll Hero assets for a tenant.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { getSupabaseServerClient }  from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? ctx.tenant_id ?? ''
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== tenantId) return forbidden()

  const sp = req.nextUrl.searchParams
  const assetType  = sp.get('assetType')
  const websiteId  = sp.get('websiteId')
  const businessId = sp.get('businessId')
  const sectionId  = sp.get('sectionId')
  const renderMode = sp.get('renderMode')

  const db = getSupabaseServerClient()
  // website_3d_assets is not in the generated Supabase types yet — cast to any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db as any)
    .from('website_3d_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (assetType)  q = q.eq('asset_type', assetType)
  if (websiteId)  q = q.eq('website_id', websiteId)
  if (businessId) q = q.eq('business_id', businessId)
  if (sectionId)  q = q.eq('section_id', sectionId)
  if (renderMode) q = q.eq('render_mode', renderMode)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: asset } = await (db as any)
    .from('website_3d_assets')
    .select('tenant_id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== asset.tenant_id) return forbidden()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('website_3d_assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
