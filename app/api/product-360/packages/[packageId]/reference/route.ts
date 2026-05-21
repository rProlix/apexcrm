import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser } from '@/lib/product-360/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { P360_REFERENCE_BUCKET, getReferencePath } from '@/lib/product-360/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ packageId: string }> }

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function extFromContentType(contentType: string): string {
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('png')) return 'png'
  return 'jpg'
}

async function loadPackage(db: ReturnType<typeof getSupabaseServerClient>, packageId: string, tenantId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any)
    .from('product_360_packages')
    .select('id, tenant_id, product_id')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
}

async function saveReferenceMetadata(opts: {
  packageId: string
  tenantId: string
  publicUrl: string
  storagePath: string
  source: 'upload' | 'product_image' | 'url'
}) {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('product_360_packages')
    .update({
      reference_image_url: opts.publicUrl,
      reference_image_storage_path: opts.storagePath,
      reference_image_path: opts.storagePath,
      reference_storage_path: opts.storagePath,
      reference_source: opts.source,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.packageId)
    .eq('tenant_id', opts.tenantId)

  if (error) throw new Error(error.message)
}

async function uploadReferenceBuffer(params: {
  tenantId: string
  productId: string
  packageId: string
  buffer: ArrayBuffer | Uint8Array
  contentType: string
}) {
  const { tenantId, productId, packageId, buffer, contentType } = params
  const supabase = getSupabaseServerClient()
  const ext = extFromContentType(contentType)
  const storagePath = getReferencePath(tenantId, productId, packageId, ext)
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  const { error } = await supabase.storage
    .from(P360_REFERENCE_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true })

  if (error) throw new Error(`Reference upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from(P360_REFERENCE_BUCKET).getPublicUrl(storagePath)
  return { publicUrl, storagePath }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId
  if (!tenantId) return NextResponse.json({ ok: false, error: 'Could not resolve tenant' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const { data: pkg, error: pkgErr } = await loadPackage(supabase, packageId, tenantId)
  if (pkgErr) return NextResponse.json({ ok: false, error: pkgErr.message }, { status: 500 })
  if (!pkg) return NextResponse.json({ ok: false, error: 'Package not found' }, { status: 404 })

  const productId = (pkg as Record<string, unknown>).product_id as string | null
  if (!productId) return NextResponse.json({ ok: false, error: 'Package has no product assigned.' }, { status: 422 })

  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const image = form.get('image') ?? form.get('file')
      if (!image || !(image instanceof Blob)) {
        return NextResponse.json({ ok: false, error: 'No image file provided. Use field "image".' }, { status: 400 })
      }
      const imageType = image.type || 'image/jpeg'
      if (!ALLOWED_TYPES.has(imageType)) {
        return NextResponse.json({ ok: false, error: `Image must be JPEG, PNG, or WebP. Got: ${imageType}` }, { status: 400 })
      }
      if (image.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ ok: false, error: 'Reference image must be under 10 MB.' }, { status: 400 })
      }

      const uploaded = await uploadReferenceBuffer({
        tenantId,
        productId,
        packageId,
        buffer: await image.arrayBuffer(),
        contentType: imageType,
      })
      await saveReferenceMetadata({ packageId, tenantId, publicUrl: uploaded.publicUrl, storagePath: uploaded.storagePath, source: 'upload' })
      return NextResponse.json({ ok: true, data: { referenceImageUrl: uploaded.publicUrl, referenceStoragePath: uploaded.storagePath, referenceSource: 'upload' } })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const source = body.source === 'product_image' ? 'product_image' : 'url'
    let imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : ''

    if (source === 'product_image' && !imageUrl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: imageRows } = await (supabase as any)
        .from('product_images')
        .select('image_url')
        .eq('tenant_id', tenantId)
        .eq('product_id', productId)
        .order('created_at', { ascending: true })
        .limit(1)
      imageUrl = (imageRows?.[0]?.image_url as string | undefined) ?? ''
    }

    if (!imageUrl) return NextResponse.json({ ok: false, error: 'imageUrl is required.' }, { status: 400 })

    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Could not download reference image: HTTP ${res.status}`)
    const downloadedType = res.headers.get('content-type') ?? ''
    if (!downloadedType.toLowerCase().startsWith('image/')) {
      throw new Error(`Reference URL did not return an image. Content-Type: ${downloadedType || 'unknown'}`)
    }

    const uploaded = await uploadReferenceBuffer({
      tenantId,
      productId,
      packageId,
      buffer: await res.arrayBuffer(),
      contentType: downloadedType,
    })
    await saveReferenceMetadata({ packageId, tenantId, publicUrl: uploaded.publicUrl, storagePath: uploaded.storagePath, source })
    return NextResponse.json({ ok: true, data: { referenceImageUrl: uploaded.publicUrl, referenceStoragePath: uploaded.storagePath, referenceSource: source } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
