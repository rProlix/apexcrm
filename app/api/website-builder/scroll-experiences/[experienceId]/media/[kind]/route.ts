export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getScrollExperienceAwsEnv } from '@/lib/server/env'
import { resolveScrollTenant } from '@/lib/website-scroll-experience/server'

const KINDS = new Set(['desktop', 'mobile', 'poster'])

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ experienceId: string; kind: string }> }
) {
  const ctx = await getUserContext()
  const tenantId = await resolveScrollTenant(ctx, req.nextUrl.searchParams.get('tenant_id'))
  if (!ctx || !tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { experienceId, kind } = await context.params
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const versionId = req.nextUrl.searchParams.get('version_id')
  if (!versionId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = getSupabaseServerClient() as SupabaseClient
  const { data: asset } = await db
    .from('website_scroll_experience_assets')
    .select('bucket,object_key,content_type')
    .eq('tenant_id', tenantId)
    .eq('experience_id', experienceId)
    .eq('experience_version_id', versionId)
    .eq('kind', kind)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const config = getScrollExperienceAwsEnv()
  const url = await getSignedUrl(
    new S3Client({ region: config.region, maxAttempts: 2 }),
    new GetObjectCommand({
      Bucket: asset.bucket,
      Key: asset.object_key,
      ResponseContentType: asset.content_type,
      ResponseContentDisposition: 'inline',
    }),
    { expiresIn: 10 * 60 }
  )
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
