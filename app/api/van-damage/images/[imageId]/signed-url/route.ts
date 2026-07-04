import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'

export const runtime = 'nodejs'

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
  const url = await getSignedUrl(
    new S3Client({ region, maxAttempts: 2 }),
    new GetObjectCommand({ Bucket: image.s3_bucket, Key: image.s3_key }),
    { expiresIn: 60 },
  )
  return NextResponse.json({ url, expiresIn: 60 })
}
