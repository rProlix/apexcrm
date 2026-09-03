import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'
import { getCachedPrivateMediaSignedUrl } from '@/lib/server/private-media/signed-url-cache'

export const runtime = 'nodejs'

const SIGNED_URL_TTL_SECONDS = 15 * 60
const allowedProfiles = new Set(['original', 'thumbnail', 'medium', 'large'])
type DerivativeAssetRow = { bucket: string | null; object_key: string | null }
let s3Client: S3Client | null = null

function isMissingImageAssetsTable(error: { code?: string; message: string } | null) {
  if (!error) return false
  return (
    error.code === 'PGRST205' ||
    /van_damage_image_assets.*schema cache|could not find the table.*van_damage_image_assets/i.test(
      error.message
    )
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'))
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { imageId } = await params
  const requestedProfile = request.nextUrl.searchParams.get('profile') ?? 'medium'
  const profile = allowedProfiles.has(requestedProfile) ? requestedProfile : 'medium'
  const db = getVanDamageServiceClient()
  const { data: image, error } = await db
    .from('van_damage_images')
    .select('id, s3_bucket, s3_key')
    .eq('id', imageId)
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  const assetDb = db as unknown as {
    from(table: 'van_damage_image_assets'): {
      select(columns: string): {
        eq(
          column: string,
          value: string
        ): {
          eq(
            column: string,
            value: string
          ): {
            eq(
              column: string,
              value: string
            ): {
              eq(
                column: string,
                value: string
              ): {
                eq(
                  column: string,
                  value: string
                ): {
                  eq(
                    column: string,
                    value: string
                  ): {
                    order(
                      column: string,
                      options: { ascending: boolean }
                    ): {
                      limit(count: number): {
                        maybeSingle(): Promise<{
                          data: DerivativeAssetRow | null
                          error: { message: string } | null
                        }>
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  let bucket = image.s3_bucket
  let key = image.s3_key
  if (profile !== 'original') {
    const { data: derivative, error: derivativeError } = await assetDb
      .from('van_damage_image_assets')
      .select('bucket, object_key')
      .eq('image_id', imageId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .eq('asset_type', profile)
      .eq('derivative_profile', profile)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (derivativeError && !isMissingImageAssetsTable(derivativeError)) {
      return NextResponse.json({ error: derivativeError.message }, { status: 500 })
    }
    if (derivative?.bucket && derivative.object_key) {
      bucket = derivative.bucket
      key = derivative.object_key
    }
  }
  if (!bucket || !key) {
    const { data: originalAsset, error: originalAssetError } = await assetDb
      .from('van_damage_image_assets')
      .select('bucket, object_key')
      .eq('image_id', imageId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .eq('asset_type', 'original')
      .eq('derivative_profile', 'original')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (originalAssetError && !isMissingImageAssetsTable(originalAssetError)) {
      return NextResponse.json({ error: originalAssetError.message }, { status: 500 })
    }
    bucket = originalAsset?.bucket ?? null
    key = originalAsset?.object_key ?? null
  }
  if (!bucket || !key)
    return NextResponse.json({ error: 'Image has not been uploaded yet' }, { status: 409 })

  const { region } = getVanDamageAwsEnv()
  const signerClient = s3Client ?? (s3Client = new S3Client({ region, maxAttempts: 2 }))
  const download = request.nextUrl.searchParams.get('download') === '1'
  const cacheKey = `${access.tenantId}:${access.businessId}:${image.id}:${profile}:${download ? 'download' : 'view'}`
  const now = Date.now()
  const signed = await getCachedPrivateMediaSignedUrl({
    cacheKey,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
    create: () =>
      getSignedUrl(
        signerClient,
        new GetObjectCommand({
          Bucket: bucket!,
          Key: key!,
          ...(download
            ? { ResponseContentDisposition: `attachment; filename="inspection-${image.id}"` }
            : {}),
        }),
        { expiresIn: SIGNED_URL_TTL_SECONDS }
      ),
  })
  const headers = {
    'Cache-Control': `private, max-age=${SIGNED_URL_TTL_SECONDS - 30}, must-revalidate`,
    Vary: 'Cookie',
  }
  if (download) return NextResponse.redirect(signed.url, { headers })
  return NextResponse.json(
    {
      url: signed.url,
      profile,
      expiresIn: Math.max(1, Math.floor((signed.expiresAt - now) / 1000)),
      expiresAt: new Date(signed.expiresAt).toISOString(),
    },
    { headers }
  )
}
