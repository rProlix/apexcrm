// app/api/product-360/packages/[packageId]/upload-reference/route.ts
//
// POST — Upload a reference image for a 360° package.
//
// The reference image is used by the Leonardo AI provider as a visual anchor
// for generating consistent 360° frames. It can also optionally be used by
// the Gemini/Imagen provider for image-conditioned generation.
//
// Request: multipart/form-data with field "image" (JPEG, PNG, or WebP)
// Response:
//   { ok: true,  data: { referenceImageUrl, referenceImageStoragePath } }
//   { ok: false, error: { type, title, message } }

import { NextRequest, NextResponse }   from 'next/server'
import { resolveP360ApiUser }          from '@/lib/product-360/auth'
import { getSupabaseServerClient }     from '@/lib/supabase/server'
import { P360_REFERENCE_BUCKET, getReferencePath } from '@/lib/product-360/storage'

export const dynamic    = 'force-dynamic'
export const maxDuration = 30

type Ctx = { params: Promise<{ packageId: string }> }

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  // 10 MB
const ALLOWED_TYPES       = new Set(['image/jpeg', 'image/png', 'image/webp'])
export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({
      ok: false,
      error: { type: 'auth_error', title: 'Unauthorized', message: 'Authentication required.' },
    }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({
      ok: false,
      error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can upload reference images.' },
    }, { status: 403 })
  }

  const tenantId = user.tenantId
  if (!tenantId) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant.' },
    }, { status: 400 })
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Invalid request', message: 'Expected multipart/form-data with an "image" field.' },
    }, { status: 400 })
  }

  const imageFile = formData.get('image') ?? formData.get('file')
  if (!imageFile || !(imageFile instanceof Blob)) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Missing image', message: 'No image file provided. Include it as field "image".' },
    }, { status: 400 })
  }

  const contentType = imageFile.type || 'image/jpeg'
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Unsupported type', message: `Image must be JPEG, PNG, or WebP. Got: ${contentType}` },
    }, { status: 400 })
  }

  if (imageFile.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'File too large', message: `Reference image must be under 10 MB. Got: ${Math.round(imageFile.size / 1024)} KB` },
    }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  // Load package to verify ownership + get productId
  const { data: pkg, error: pkgErr } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id, product_id')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .single()

  if (pkgErr || !pkg) {
    return NextResponse.json({
      ok: false,
      error: { type: 'not_found', title: 'Not found', message: 'Package not found.' },
    }, { status: 404 })
  }

  const productId = pkg.product_id as string | null
  if (!productId) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'No product', message: 'Package has no product assigned. Assign a product first.' },
    }, { status: 422 })
  }

  // Build storage path
  const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const ext          = extMap[contentType] ?? 'jpg'
  const storagePath  = getReferencePath(tenantId, productId, packageId, ext)

  // Upload to Supabase Storage
  const imageBuffer  = Buffer.from(await imageFile.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from(P360_REFERENCE_BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType,
      upsert: true,
    })

  if (uploadErr) {
    const msg = uploadErr.message?.toLowerCase() ?? ''
    if (msg.includes('bucket') || msg.includes('not found')) {
      return NextResponse.json({
        ok: false,
        error: {
          type:    'storage_error',
          title:   'Storage not configured',
          message: `Storage bucket "${P360_REFERENCE_BUCKET}" not found. Run the product 360 Leonardo reference workflow migration to create it.`,
        },
      }, { status: 503 })
    }
    return NextResponse.json({
      ok: false,
      error: { type: 'storage_error', title: 'Upload failed', message: uploadErr.message },
    }, { status: 500 })
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(P360_REFERENCE_BUCKET).getPublicUrl(storagePath)

  // Update package record (cast to bypass typed client — new columns from migration 046)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from('product_360_packages')
    .update({
      reference_image_url:          publicUrl,
      reference_image_storage_path: storagePath,
      reference_image_path:         storagePath,
      reference_storage_path:       storagePath,
      reference_source:             'upload',
      updated_at:                   new Date().toISOString(),
    })
    .eq('id', packageId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    console.error('[upload-reference] Failed to update package record:', updateErr.message)
    // Non-fatal — image is uploaded, just the DB record update failed
  }

  return NextResponse.json({
    ok: true,
    data: {
      referenceImageUrl:          publicUrl,
      referenceImageStoragePath:  storagePath,
      message: 'Reference image uploaded successfully.',
    },
  })
}
