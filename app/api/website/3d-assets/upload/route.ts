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
  'glb', 'gltf', 'video', 'image_sequence', 'image_sequence_frame', 'thumbnail',
  'poster', 'fallback', 'environment', 'texture',
])

const VALID_RENDER_MODES = new Set(['three_model', 'video_scrub'])

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'asset'
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

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

  // Optional grouping / scoping fields (Media Manager).
  const websiteId  = (form.get('website_id') as string | null) || null
  const businessId = (form.get('business_id') as string | null) || null
  const sectionId  = (form.get('section_id') as string | null) || null
  const sequenceId = (form.get('sequence_id') as string | null) || null
  const renderMode = (form.get('render_mode') as string | null) || null
  const sortOrder  = intOrNull(form.get('sort_order')) ?? 0
  let metadata: Record<string, unknown> = {}
  try {
    const m = form.get('metadata')
    if (m) metadata = JSON.parse(String(m))
  } catch { /* ignore malformed metadata */ }

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!VALID_ASSET_TYPES.has(assetType)) {
    return NextResponse.json({ error: `Invalid asset_type "${assetType}"` }, { status: 422 })
  }
  if (renderMode && !VALID_RENDER_MODES.has(renderMode)) {
    return NextResponse.json({ error: `Invalid render_mode "${renderMode}"` }, { status: 422 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  if (BLOCKED_EXT.has(ext)) {
    return NextResponse.json({ error: 'Spline files are not supported' }, { status: 415 })
  }

  const contentType = EXT_MIME[ext] ?? file.type ?? 'application/octet-stream'
  // Tenant-safe, structured storage path.
  const safeName = sanitizeFilename(file.name)
  const scope = websiteId ? `${websiteId}/${sectionId ?? 'unassigned'}` : '_library'
  const filename = `tenants/${tenantId}/website-builder/3d-hero/${scope}/${assetType}/${Date.now()}-${safeName}`

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
      website_id:      websiteId,
      business_id:     businessId,
      section_id:      sectionId,
      sequence_id:     sequenceId,
      name,
      asset_type:      assetType,
      render_mode:     renderMode,
      storage_provider:'supabase',
      bucket:          BUCKET,
      storage_path:    filename,
      public_url:      publicUrl,
      file_size_bytes: file.size,
      mime_type:       contentType,
      width:           intOrNull(form.get('width')),
      height:          intOrNull(form.get('height')),
      duration_seconds: numOrNull(form.get('duration_seconds')),
      frame_count:     intOrNull(form.get('frame_count')),
      frame_index:     intOrNull(form.get('frame_index')),
      fps:             numOrNull(form.get('fps')),
      sort_order:      sortOrder,
      created_by:      ctx.id ?? null,
      metadata:        { original_name: file.name, ...metadata },
    })
    .select('*')
    .single()

  if (insertError) {
    // Asset is uploaded; still return the URL so the section can use it.
    return NextResponse.json({ url: publicUrl, asset: null, warning: insertError.message })
  }

  return NextResponse.json({ url: publicUrl, asset })
}
