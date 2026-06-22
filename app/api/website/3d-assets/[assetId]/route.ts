// app/api/website/3d-assets/[assetId]/route.ts
//
// PATCH  — rename / update metadata / sort order / archive a 3D hero asset.
// DELETE — soft-archive (default) or hard-delete (?hard=true) a 3D hero asset.
//
// Tenant-scoped, owner/admin only. The section content (videoUrl / imageSequenceUrls)
// is the runtime source of truth, so deleting/archiving an asset row never breaks a
// published site; the builder surfaces a "missing asset" warning if a URL is gone.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { getSupabaseServerClient }  from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ assetId: string }> }

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function loadAsset(assetId: string) {
  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('website_3d_assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle()
  return { db, asset: data as Record<string, unknown> | null }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { assetId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await req.json().catch(() => ({}))) as Record<string, any>

  const { db, asset } = await loadAsset(assetId)
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== asset.tenant_id) return forbidden()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {}
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 200)
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order
  if (typeof body.is_archived === 'boolean') update.is_archived = body.is_archived
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (body.metadata && typeof body.metadata === 'object') {
    update.metadata = { ...(asset.metadata as Record<string, unknown> ?? {}), ...body.metadata }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (db as any)
    .from('website_3d_assets')
    .update(update)
    .eq('id', assetId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, asset: updated })
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { assetId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const hard = req.nextUrl.searchParams.get('hard') === 'true'

  const { db, asset } = await loadAsset(assetId)
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== asset.tenant_id) return forbidden()

  if (hard) {
    // Best-effort remove the storage object too.
    const bucket = asset.bucket as string | undefined
    const path = asset.storage_path as string | undefined
    if (bucket && path) {
      try { await db.storage.from(bucket).remove([path]) } catch { /* ignore */ }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('website_3d_assets').delete().eq('id', assetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('website_3d_assets')
    .update({ is_archived: true, is_active: false })
    .eq('id', assetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, archived: true })
}
