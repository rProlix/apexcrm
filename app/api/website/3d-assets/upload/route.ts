// app/api/website/3d-assets/upload/route.ts
// Upload a Premium 3D Scroll Hero asset (GLB/GLTF model, H.264 MP4 video,
// poster / fallback image, environment HDR, image-sequence frame) to the public
// website-assets bucket and record it in website_3d_assets.
//
// NOTE: This route does NOT accept Spline files. .splinecode and Spline scene
// URLs are intentionally unsupported.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { STORAGE_BUCKETS }          from '@/lib/storage/buckets'

const BUCKET = STORAGE_BUCKETS.WEBSITE_ASSETS

// Larger limit than image uploads — models/videos are bigger.
const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

const VALID_ASSET_TYPES = new Set([
  'glb', 'gltf', 'video', 'image_sequence', 'thumbnail',
  'poster', 'fallback', 'environment', 'texture',
])

// Reject any Spline-related upload defensively.
const BLOCKED_EXT = new Set(['splinecode', 'spline'])

const EXT_MIME: Record<string, string> = {
  glb:  'model/gltf-binary',
  gltf: 'model/gltf+json',
  mp4:  'video/mp4',
  webm: 'video/webm',
  webp: 'image/webp',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  hdr:  'image/vnd.radiance',
  exr:  'image/x-exr',
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = ctx.tenant_id ?? req.nextUrl.searchParams.get('tenant_id') ?? ''
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const form      = await req.formData()
  const file      = form.get('file') as File | null
  const assetType = (form.get('asset_type') as string | null) ?? 'glb'
  const name      = (form.get('name') as string | null) ?? (file?.name ?? 'asset')

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!VALID_ASSET_TYPES.has(assetType)) {
    return NextResponse.json({ error: `Invalid asset_type "${assetType}"` }, { status: 422 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  if (BLOCKED_EXT.has(ext)) {
    return NextResponse.json({ error: 'Spline files are not supported' }, { status: 415 })
  }

  const contentType = EXT_MIME[ext] ?? file.type ?? 'application/octet-stream'
  const filename = `${tenantId}/3d/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const db = getSupabaseServerClient()

  const doUpload = () =>
    db.storage.from(BUCKET).upload(filename, file, { contentType, upsert: false })

  let { error: uploadError } = await doUpload()
  if (uploadError && (uploadError.message.includes('not found') || uploadError.message.includes('Bucket not found'))) {
    await db.storage.createBucket(BUCKET, { public: true })
    ;({ error: uploadError } = await doUpload())
  }
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(filename)
  const publicUrl = publicData.publicUrl

  // website_3d_assets is not in the generated Supabase types yet — cast to any
  // (same pattern as the product_360_* tables).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: asset, error: insertError } = await (db as any)
    .from('website_3d_assets')
    .insert({
      tenant_id:       tenantId,
      name,
      asset_type:      assetType,
      storage_provider:'supabase',
      storage_path:    filename,
      public_url:      publicUrl,
      file_size_bytes: file.size,
      mime_type:       contentType,
      created_by:      ctx.id ?? null,
      metadata:        { original_name: file.name },
    })
    .select('*')
    .single()

  if (insertError) {
    // Asset is uploaded; still return the URL so the section can use it.
    return NextResponse.json({ url: publicUrl, asset: null, warning: insertError.message })
  }

  return NextResponse.json({ url: publicUrl, asset })
}
