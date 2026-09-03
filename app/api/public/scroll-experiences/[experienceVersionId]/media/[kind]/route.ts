export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getScrollExperienceAwsEnv } from '@/lib/server/env'
import { resolvePublicScrollExperienceBinding } from '@/lib/website-scroll-experience/public-binding'

const PUBLIC_KINDS = new Set(['desktop', 'mobile', 'poster'])

export async function GET(
  _req: Request,
  context: { params: Promise<{ experienceVersionId: string; kind: string }> }
) {
  const { experienceVersionId, kind } = await context.params
  if (!PUBLIC_KINDS.has(kind)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = getSupabaseServerClient() as SupabaseClient
  const binding = await resolvePublicScrollExperienceBinding(db, experienceVersionId)
  if (!binding) {
    console.warn('[scroll-media] public binding unavailable', { experienceVersionId, kind })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { data: asset } = await db
    .from('website_scroll_experience_assets')
    .select('storage_provider,bucket,object_key,content_type')
    .eq('experience_version_id', experienceVersionId)
    .eq('tenant_id', binding.tenant_id)
    .eq('kind', kind)
    .maybeSingle()
  if (!asset) {
    console.warn('[scroll-media] processed asset unavailable', { experienceVersionId, kind })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  let signedUrl: string
  if (asset.storage_provider === 'supabase') {
    const { data, error } = await db.storage
      .from(asset.bucket)
      .createSignedUrl(asset.object_key, 600)
    if (error || !data) {
      console.warn('[scroll-media] Supabase signing failed', { experienceVersionId, kind })
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    signedUrl = data.signedUrl
  } else {
    const config = getScrollExperienceAwsEnv()
    signedUrl = await getSignedUrl(
      new S3Client({ region: config.region, maxAttempts: 2 }),
      new GetObjectCommand({
        Bucket: asset.bucket,
        Key: asset.object_key,
        ResponseContentType: asset.content_type,
        ResponseCacheControl: 'public, max-age=31536000, immutable',
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: 10 * 60 }
    )
  }
  return NextResponse.redirect(signedUrl, {
    status: 307,
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' },
  })
}
