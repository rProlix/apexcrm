// app/api/website/assets/upload/route.ts
// Upload an image to Supabase storage and record it in site_assets.
// Used by section editors (hero background, about image, etc.)

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const BUCKET = 'website-assets'
const MAX_SIZE_MB = 10

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = (ctx.tenant_id ?? req.nextUrl.searchParams.get('tenant_id') ?? '')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const form = await req.formData()
  const file = form.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `File exceeds ${MAX_SIZE_MB}MB limit` }, { status: 413 })
  }

  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filename = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const db = getSupabaseServerClient()

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(filename, file, {
      contentType:  file.type,
      upsert:       false,
    })

  if (uploadError) {
    // Bucket may not exist yet — create it and retry once
    if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket not found')) {
      await db.storage.createBucket(BUCKET, { public: true })
      const { error: retryErr } = await db.storage
        .from(BUCKET)
        .upload(filename, file, { contentType: file.type, upsert: false })
      if (retryErr) {
        return NextResponse.json({ error: retryErr.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
  }

  const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(filename)
  const publicUrl = publicData.publicUrl

  // Record in site_assets table
  await db.from('site_assets').insert({
    tenant_id:  tenantId,
    asset_type: 'image',
    url:        publicUrl,
    metadata:   { filename: file.name, size: file.size, type: file.type },
  })

  return NextResponse.json({ url: publicUrl, filename })
}
