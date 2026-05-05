// app/api/website/ai-images/test-storage/route.ts
// POST /api/website/ai-images/test-storage
// Uploads a tiny test PNG to website-assets bucket without calling Imagen.
// Use this to prove Supabase Storage works independently of image generation.
// Protected: only owner/admin may call this route.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { WEBSITE_IMAGE_BUCKET } from '@/lib/ai/websiteImageConfig'

export const dynamic = 'force-dynamic'

// A minimal valid 1×1 red PNG (67 bytes), base64-encoded.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=='

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // Accept optional tenantId from body to build a realistic path
  let tenantId = ctx.tenant_id ?? 'test-tenant'
  try {
    const body = await req.json() as { tenantId?: string }
    if (body.tenantId) tenantId = body.tenantId
  } catch { /* no body — use defaults */ }

  const timestamp   = Date.now()
  const storagePath = `tenants/${tenantId}/website/generated/test-plan/test_${timestamp}.png`
  const mimeType    = 'image/png'
  const buffer      = Buffer.from(TINY_PNG_BASE64, 'base64')

  console.log('[AI-IMAGE][TEST-STORAGE] upload starting', {
    bucket:     WEBSITE_IMAGE_BUCKET,
    storagePath,
    sizeBytes:  buffer.length,
    tenantId,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  // ── Check bucket exists ───────────────────────────────────────────────────
  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets()
  if (bucketsErr) {
    return NextResponse.json({
      ok:     false,
      step:   'list_buckets',
      error:  bucketsErr.message,
      detail: 'Could not list storage buckets. Check SUPABASE_SERVICE_ROLE_KEY.',
    }, { status: 500 })
  }

  const bucketExists = buckets?.some(b => b.id === WEBSITE_IMAGE_BUCKET)
  if (!bucketExists) {
    return NextResponse.json({
      ok:     false,
      step:   'bucket_check',
      error:  `Bucket "${WEBSITE_IMAGE_BUCKET}" does not exist.`,
      detail: `Run migration 031_website_assets_bucket.sql, or go to Supabase Dashboard → Storage → New bucket → name: "${WEBSITE_IMAGE_BUCKET}", public: true.`,
      buckets: buckets?.map(b => b.id) ?? [],
    }, { status: 404 })
  }

  // ── Upload test image ─────────────────────────────────────────────────────
  const { error: uploadErr } = await supabase.storage
    .from(WEBSITE_IMAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

  if (uploadErr) {
    console.error('[AI-IMAGE][TEST-STORAGE] upload failed', uploadErr)
    return NextResponse.json({
      ok:         false,
      step:       'upload',
      error:      uploadErr.message,
      storagePath,
      bucket:     WEBSITE_IMAGE_BUCKET,
    }, { status: 500 })
  }

  // ── Get public URL ────────────────────────────────────────────────────────
  const { data: urlData } = supabase.storage.from(WEBSITE_IMAGE_BUCKET).getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  console.log('[AI-IMAGE][TEST-STORAGE] upload success', { storagePath, publicUrl })

  return NextResponse.json({
    ok:         true,
    bucket:     WEBSITE_IMAGE_BUCKET,
    storagePath,
    publicUrl,
    sizeBytes:  buffer.length,
    mimeType,
    message:    'Test image uploaded successfully. Storage is working correctly.',
  })
}
