// app/api/website/3d-assets/sign-upload/route.ts
//
// Vercel-safe uploads: large 3D models / H.264 MP4 videos / image-sequence
// frames must NOT be streamed through a serverless function (Vercel caps the
// request body at ~4.5 MB). Instead the client asks this route for a one-time
// signed upload URL and uploads the file DIRECTLY to Supabase Storage, then
// records the asset via /record. This route only handles a tiny JSON body.
//
// NO Spline files.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { STORAGE_BUCKETS }          from '@/lib/storage/buckets'

const BUCKET = STORAGE_BUCKETS.WEBSITE_ASSETS

const VALID_ASSET_TYPES = new Set([
  'glb', 'gltf', 'video', 'image_sequence', 'image_sequence_frame', 'thumbnail',
  'poster', 'fallback', 'environment', 'texture',
])
const VALID_RENDER_MODES = new Set(['three_model', 'video_scrub'])
const BLOCKED_EXT = new Set(['splinecode', 'spline'])

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'asset'
}
function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json().catch(() => ({})) as {
    tenant_id?: string; asset_type?: string; render_mode?: string
    website_id?: string; section_id?: string; filename?: string
  }

  const tenantId = ctx.tenant_id ?? body.tenant_id ?? ''
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== tenantId) return forbidden()

  const assetType = body.asset_type ?? 'glb'
  if (!VALID_ASSET_TYPES.has(assetType)) {
    return NextResponse.json({ error: `Invalid asset_type "${assetType}"` }, { status: 422 })
  }
  if (body.render_mode && !VALID_RENDER_MODES.has(body.render_mode)) {
    return NextResponse.json({ error: `Invalid render_mode "${body.render_mode}"` }, { status: 422 })
  }

  const rawName = body.filename ?? 'asset'
  const ext = rawName.split('.').pop()?.toLowerCase() ?? 'bin'
  if (BLOCKED_EXT.has(ext)) {
    return NextResponse.json({ error: 'Spline files are not supported' }, { status: 415 })
  }

  const scope = body.website_id ? `${body.website_id}/${body.section_id ?? 'unassigned'}` : '_library'
  const path = `tenants/${tenantId}/website-builder/3d-hero/${scope}/${assetType}/${Date.now()}-${sanitize(rawName)}`

  const db = getSupabaseServerClient()

  const sign = () => db.storage.from(BUCKET).createSignedUploadUrl(path)
  let { data, error } = await sign()
  if (error && (error.message.includes('not found') || error.message.includes('Bucket not found'))) {
    await db.storage.createBucket(BUCKET, { public: true })
    ;({ data, error } = await sign())
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not sign upload' }, { status: 500 })
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({
    bucket:    BUCKET,
    path,
    token:     data.token,
    signedUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
  })
}
