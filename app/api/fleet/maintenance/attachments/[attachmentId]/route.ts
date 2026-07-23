import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'

const cache = new Map<string, { url: string; expires: number }>()

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
  const current = cache.get(attachmentId)
  if (current && current.expires > Date.now()) return NextResponse.redirect(current.url)
  const { region } = getVanDamageAwsEnv()
  const url = await getSignedUrl(
    new S3Client({ region, maxAttempts: 2 }),
    new GetObjectCommand({
      Bucket: data.s3_bucket,
      Key: data.s3_key,
    }),
    { expiresIn: 900 }
  )
  cache.set(attachmentId, { url, expires: Date.now() + 12 * 60_000 })
  return NextResponse.redirect(url)
}
