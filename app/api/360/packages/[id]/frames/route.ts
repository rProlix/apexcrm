// app/api/360/packages/[id]/frames/route.ts
// GET  /api/360/packages/[id]/frames   — list frames ordered by frame_index
// POST /api/360/packages/[id]/frames   — upload/register a frame manually

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { resolve360ApiUser }          from '@/lib/360/auth'
import { upload360Frame }             from '@/lib/360/storage'

type Params = { params: Promise<{ id: string }> }

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: frames, error } = await supabase
    .from('product_360_frames')
    .select('id, frame_index, angle_degrees, image_url, storage_path, width, height, created_at')
    .eq('package_id', id)
    .order('frame_index')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ frames: frames ?? [] })
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id, frame_count, status')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse multipart or JSON ───────────────────────────────────────────────
  const contentType = req.headers.get('content-type') ?? ''
  let frameIndex: number
  let imageUrl:   string | null = null
  let fileBuffer: Uint8Array | null = null

  if (contentType.includes('multipart/form-data')) {
    // Manual file upload
    const form    = await req.formData()
    const idx     = form.get('frame_index')
    const file    = form.get('file') as File | null
    const urlVal  = form.get('image_url')

    if (idx === null) return NextResponse.json({ error: 'frame_index is required' }, { status: 400 })
    frameIndex = Number(idx)

    if (file) {
      fileBuffer = new Uint8Array(await file.arrayBuffer())
    } else if (typeof urlVal === 'string' && urlVal.trim()) {
      imageUrl = urlVal.trim()
    } else {
      return NextResponse.json({ error: 'Provide either a file or image_url' }, { status: 400 })
    }
  } else {
    // JSON body with image_url
    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    if (typeof body.frame_index !== 'number')
      return NextResponse.json({ error: 'frame_index is required' }, { status: 400 })
    frameIndex = body.frame_index
    imageUrl   = typeof body.image_url === 'string' ? body.image_url.trim() || null : null
  }

  if (frameIndex < 0)
    return NextResponse.json({ error: 'frame_index must be >= 0' }, { status: 400 })

  const angleSequence  = Array.from({ length: pkg.frame_count }, (_, i) => Math.round(i * 360 / pkg.frame_count))
  const angle_degrees  = angleSequence[frameIndex] ?? Math.round((frameIndex / pkg.frame_count) * 360)

  let finalImageUrl    = imageUrl ?? ''
  let storagePath: string | null = null

  // Upload file to storage if provided
  if (fileBuffer) {
    try {
      const result  = await upload360Frame({
        tenantId:   pkg.tenant_id,
        packageId:  id,
        frameIndex,
        buffer:     fileBuffer,
      })
      finalImageUrl = result.imageUrl
      storagePath   = result.storagePath
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Storage upload failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } else if (!finalImageUrl) {
    return NextResponse.json({ error: 'No image data provided' }, { status: 400 })
  }

  // Upsert frame row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: frame, error: frameErr } = await (supabase as any)
    .from('product_360_frames')
    .upsert({
      package_id:    id,
      tenant_id:     pkg.tenant_id,
      frame_index:   frameIndex,
      angle_degrees,
      image_url:     finalImageUrl,
      storage_path:  storagePath,
    }, { onConflict: 'package_id,frame_index' })
    .select()
    .single()

  if (frameErr || !frame) {
    console.error('[POST /api/360/packages/[id]/frames]', frameErr?.message)
    return NextResponse.json({ error: frameErr?.message ?? 'Failed to save frame' }, { status: 500 })
  }

  // Update cover_image_url from frame 0
  if (frameIndex === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('product_360_packages')
      .update({ cover_image_url: finalImageUrl })
      .eq('id', id)
  }

  // Count frames — if all done, mark ready
  const { count: frameCount } = await supabase
    .from('product_360_frames')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', id)

  const allDone = (frameCount ?? 0) >= pkg.frame_count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (allDone && (pkg.status as any) !== 'ready') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('product_360_packages')
      .update({ status: 'ready' })
      .eq('id', id)
  }

  return NextResponse.json({
    frame,
    frames_done: frameCount ?? 0,
    status:      allDone ? 'ready' : pkg.status,
  }, { status: 201 })
}
