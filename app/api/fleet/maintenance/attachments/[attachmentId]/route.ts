import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'
import { getCachedPrivateMediaSignedUrl } from '@/lib/server/private-media/signed-url-cache'

const SIGNED_URL_TTL_SECONDS = 15 * 60

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attachmentId: string }> }
) {
  const { attachmentId } = await context.params
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'))
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { data } = await getVanDamageServiceClient()
    .from('fleet_maintenance_attachments')
    .select('id,s3_bucket,s3_key,status')
    .eq('id', attachmentId)
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)
    .maybeSingle()
  if (!data || data.status !== 'uploaded' || !data.s3_bucket || !data.s3_key) {
    return NextResponse.json({ error: 'Attachment not available' }, { status: 404 })
  }
  const { region } = getVanDamageAwsEnv()
  const now = Date.now()
  const signed = await getCachedPrivateMediaSignedUrl({
    cacheKey: `${access.tenantId}:${access.businessId}:maintenance:${attachmentId}`,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
    create: () => getSignedUrl(
      new S3Client({ region, maxAttempts: 2 }),
      new GetObjectCommand({ Bucket: data.s3_bucket!, Key: data.s3_key! }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    ),
  })
  const headers = {
    'Cache-Control': `private, max-age=${SIGNED_URL_TTL_SECONDS - 30}, must-revalidate`,
    Vary: 'Cookie',
  }
  if (request.nextUrl.searchParams.get('format') !== 'json') {
    return NextResponse.redirect(signed.url, { headers })
  }
  return NextResponse.json({
    url: signed.url,
    expiresIn: Math.max(1, Math.floor((signed.expiresAt - now) / 1000)),
    expiresAt: new Date(signed.expiresAt).toISOString(),
  }, { headers })
}
