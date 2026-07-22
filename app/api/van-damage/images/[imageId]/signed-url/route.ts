import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'

export const runtime = 'nodejs'

const SIGNED_URL_TTL_SECONDS = 15 * 60
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'))
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { imageId } = await params
  const db = getVanDamageServiceClient()
  const { data: image, error } = await db.from('van_damage_images')
    .select('id, s3_bucket, s3_key')
    .eq('id', imageId)
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  if (!image.s3_bucket || !image.s3_key) return NextResponse.json({ error: 'Image has not been uploaded yet' }, { status: 409 })

  const { region } = getVanDamageAwsEnv()
  const download = request.nextUrl.searchParams.get('download') === '1'
  const cacheKey = `${access.tenantId}:${access.businessId}:${image.id}:${download ? 'download' : 'view'}`
  const cached = signedUrlCache.get(cacheKey)
  const now = Date.now()
  let signed = cached && cached.expiresAt - 30_000 > now ? cached : null
  if (!signed) {
    const url = await getSignedUrl(
      new S3Client({ region, maxAttempts: 2 }),
      new GetObjectCommand({
        Bucket: image.s3_bucket,
        Key: image.s3_key,
        ...(download ? { ResponseContentDisposition: `attachment; filename="inspection-${image.id}"` } : {}),
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    )
    signed = { url, expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000 }
    signedUrlCache.set(cacheKey, signed)
    if (signedUrlCache.size > 1000) {
      const oldestKey = signedUrlCache.keys().next().value
      if (oldestKey) signedUrlCache.delete(oldestKey)
    }
  }
  const headers = {
    'Cache-Control': `private, max-age=${SIGNED_URL_TTL_SECONDS - 30}, must-revalidate`,
    Vary: 'Cookie',
  }
  if (download) return NextResponse.redirect(signed.url, { headers })
  return NextResponse.json({
    url: signed.url,
    expiresIn: Math.max(1, Math.floor((signed.expiresAt - now) / 1000)),
    expiresAt: new Date(signed.expiresAt).toISOString(),
  }, { headers })
}
