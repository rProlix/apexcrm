// app/api/product-360/packages/[packageId]/frames/route.ts
import { NextRequest, NextResponse }      from 'next/server'
import { resolveP360ApiUser }             from '@/lib/product-360/auth'
import { listFrames, upsertFrame, syncPackageAfterFrameUpload } from '@/lib/product-360/frameService'
import { uploadFrame }                    from '@/lib/product-360/storage'
import { getSupabaseServerClient }        from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

// GET /api/product-360/packages/[packageId]/frames
export async function GET(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const frames = await listFrames(packageId)
    return NextResponse.json({ frames })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

// POST /api/product-360/packages/[packageId]/frames
// Accepts multipart (file upload) or JSON ({ imageUrl, frameIndex, angleDegrees })
export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  // Fetch package to verify ownership and get productId + targetFrameCount
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg } = await (supabase as any)
    .from('product_360_packages')
    .select('id, product_id, target_frame_count')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  const productId        = (pkg as Record<string, unknown>).product_id as string
  const targetFrameCount = ((pkg as Record<string, unknown>).target_frame_count as number) || 36

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    // ─── File upload ──────────────────────────────────────────────────────────
    let formData: FormData
    try { formData = await req.formData() }
    catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

    const file       = formData.get('file') as File | null
    const frameIndex = parseInt(formData.get('frameIndex') as string ?? '0', 10)
    const angleDeg   = parseFloat(formData.get('angleDegrees') as string ?? String(Math.round((360 / targetFrameCount) * frameIndex)))

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const ext    = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'

    const { imageUrl, storagePath } = await uploadFrame({
      tenantId, productId, packageId, frameIndex,
      buffer, contentType: file.type, ext,
    })

    const frame = await upsertFrame({
      packageId, tenantId, productId, frameIndex,
      angleDegrees: angleDeg,
      imageUrl, storagePath,
      fileSize: buffer.byteLength,
    })

    await syncPackageAfterFrameUpload({
      packageId, tenantId, targetFrameCount,
      newFrameIndex: frameIndex, newImageUrl: imageUrl,
    })

    return NextResponse.json({ frame }, { status: 201 })

  } else {
    // ─── JSON image URL registration ──────────────────────────────────────────
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const imageUrl   = body.imageUrl   as string | undefined
    const frameIndex = body.frameIndex as number | undefined
    const angleDeg   = (body.angleDegrees as number | undefined)
      ?? Math.round((360 / targetFrameCount) * (frameIndex ?? 0))

    if (!imageUrl)                            return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
    if (frameIndex === undefined || frameIndex === null) return NextResponse.json({ error: 'frameIndex is required' }, { status: 400 })

    const frame = await upsertFrame({
      packageId, tenantId, productId, frameIndex,
      angleDegrees: angleDeg,
      imageUrl,
      altText: body.altText as string | undefined,
    })

    await syncPackageAfterFrameUpload({
      packageId, tenantId, targetFrameCount,
      newFrameIndex: frameIndex, newImageUrl: imageUrl,
    })

    return NextResponse.json({ frame }, { status: 201 })
  }
}
