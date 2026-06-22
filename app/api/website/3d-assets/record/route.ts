// app/api/website/3d-assets/record/route.ts
//
// Records a website_3d_assets row AFTER the client has uploaded the file
// directly to Supabase Storage via a signed upload URL (see /sign-upload).
// JSON body only — no large payloads pass through the serverless function, so
// this is safe within Vercel's request-body limits.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { STORAGE_BUCKETS }          from '@/lib/storage/buckets'

const VALID_ASSET_TYPES = new Set([
  'glb', 'gltf', 'video', 'image_sequence', 'image_sequence_frame', 'thumbnail',
  'poster', 'fallback', 'environment', 'texture',
])

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = (await req.json().catch(() => ({}))) as Record<string, any>

  const tenantId = ctx.tenant_id ?? b.tenant_id ?? ''
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== tenantId) return forbidden()

  const assetType = String(b.asset_type ?? '')
  if (!VALID_ASSET_TYPES.has(assetType)) {
    return NextResponse.json({ error: `Invalid asset_type "${assetType}"` }, { status: 422 })
  }
  if (!b.storage_path || !b.public_url) {
    return NextResponse.json({ error: 'storage_path and public_url required' }, { status: 400 })
  }

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: asset, error } = await (db as any)
    .from('website_3d_assets')
    .insert({
      tenant_id:        tenantId,
      website_id:       b.website_id ?? null,
      business_id:      b.business_id ?? null,
      section_id:       b.section_id ?? null,
      name:             b.name ?? 'asset',
      asset_type:       assetType,
      render_mode:      b.render_mode ?? null,
      storage_provider: 'supabase',
      bucket:           b.bucket ?? STORAGE_BUCKETS.WEBSITE_ASSETS,
      storage_path:     b.storage_path,
      public_url:       b.public_url,
      file_size_bytes:  b.file_size_bytes ?? null,
      mime_type:        b.mime_type ?? null,
      width:            b.width ?? null,
      height:           b.height ?? null,
      duration_seconds: b.duration_seconds ?? null,
      frame_count:      b.frame_count ?? null,
      frame_index:      b.frame_index ?? null,
      fps:              b.fps ?? null,
      sort_order:       b.sort_order ?? 0,
      created_by:       ctx.id ?? null,
      metadata:         { original_name: b.name ?? 'asset', ...(b.metadata ?? {}) },
    })
    .select('*')
    .single()

  if (error) {
    // The file is already in storage; still return the URL so the section works.
    return NextResponse.json({ url: b.public_url, asset: null, warning: error.message })
  }
  return NextResponse.json({ url: b.public_url, asset })
}
