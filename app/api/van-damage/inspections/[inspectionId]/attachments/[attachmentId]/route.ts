import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageAwsEnv } from '@/lib/server/env'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export const runtime = 'nodejs'

type ValueRecord = Record<string, unknown>
function record(value: unknown): ValueRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ValueRecord : {}
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string; attachmentId: string }> },
) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'))
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { inspectionId, attachmentId } = await params
  const { data: inspection, error } = await getVanDamageServiceClient().from('van_damage_inspections')
    .select('metadata').eq('id', inspectionId).eq('tenant_id', access.tenantId).eq('business_id', access.businessId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!inspection) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  const phase = record(record(inspection.metadata).phase3c)
  const comments = Array.isArray(phase.comments) ? phase.comments : []
  const attachment = comments.flatMap((comment) => {
    const attachments = record(comment).attachments
    return Array.isArray(attachments) ? attachments : []
  }).map(record).find((item) => item.id === attachmentId)
  if (!attachment || typeof attachment.bucket !== 'string' || typeof attachment.key !== 'string') {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }
  const { region } = getVanDamageAwsEnv()
  const url = await getSignedUrl(new S3Client({ region, maxAttempts: 2 }), new GetObjectCommand({
    Bucket: attachment.bucket,
    Key: attachment.key,
    ResponseContentDisposition: `attachment; filename="${String(attachment.name || 'attachment').replaceAll('"', '')}"`,
  }), { expiresIn: 60 })
  return NextResponse.redirect(url)
}
