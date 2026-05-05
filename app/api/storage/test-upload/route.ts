// app/api/storage/test-upload/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/storage/test-upload
// Owner/admin only.
//
// Body (JSON):
//   {
//     bucket: string,       // STORAGE_BUCKETS value
//     tenantId: string,     // uuid of the tenant to test
//     category?: string     // optional label, defaults to "storage-test"
//   }
//
// Uploads a tiny text file to:
//   tenants/{tenantId}/temp/storage-test-{timestamp}.txt
//
// Returns the URL (public or signed) so the caller can verify storage works.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }            from '@/lib/auth/getUserContext'
import { uploadFile }                from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS, type StorageBucket } from '@/lib/storage/buckets'

const ALL_BUCKETS = new Set<string>(Object.values(STORAGE_BUCKETS))

export async function POST(req: NextRequest) {
  // Owner or admin gate
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden — owner or admin access required' }, { status: 403 })
  }

  let body: { bucket?: string; tenantId?: string; category?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { bucket, tenantId, category = 'storage-test' } = body

  if (!bucket || !ALL_BUCKETS.has(bucket)) {
    return NextResponse.json(
      { error: `Invalid bucket. Allowed values: ${[...ALL_BUCKETS].join(', ')}` },
      { status: 400 },
    )
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  // Admins can only test their own tenant.
  if (ctx.role === 'admin' && ctx.tenant_id && ctx.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Forbidden — admin can only test their own tenant' }, { status: 403 })
  }

  const timestamp  = Date.now()
  const fileName   = `${category}-${timestamp}.txt`
  const content    = `Nexora Storage test\nbucket=${bucket}\ntenantId=${tenantId}\ntimestamp=${timestamp}\n`
  const buffer     = Buffer.from(content, 'utf-8')

  try {
    const result = await uploadFile({
      bucket:       bucket as StorageBucket,
      tenantId,
      pathParts:    ['temp'],
      fileName,
      buffer:       new Uint8Array(buffer),
      mimeType:     'text/plain',
      upsert:       true,
      withSignedUrl: true,
      signedUrlExpiresIn: 300, // 5 min — just long enough to verify
    })

    return NextResponse.json({
      ok:        true,
      bucket:    result.bucket,
      path:      result.path,
      publicUrl: result.publicUrl  ?? null,
      signedUrl: result.signedUrl  ?? null,
      sizeBytes: result.sizeBytes,
      mimeType:  result.mimeType,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
