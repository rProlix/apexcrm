import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getVanDamageAwsEnv } from '@/lib/server/env'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export const MAINTENANCE_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'video/mp4',
  'video/quicktime',
])

export const MAX_MAINTENANCE_ATTACHMENT_BYTES = 25 * 1024 * 1024

function safeFileName(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'attachment'
  )
}

export async function uploadMaintenanceAttachment(input: {
  attachmentId: string
  tenantId: string
  businessId: string
  itemId: string
  filename: string
  contentType: string
  bytes: Uint8Array
}) {
  if (!MAINTENANCE_ATTACHMENT_TYPES.has(input.contentType))
    throw new Error('Unsupported maintenance attachment type')
  if (input.bytes.byteLength > MAX_MAINTENANCE_ATTACHMENT_BYTES)
    throw new Error('Maintenance attachment exceeds 25 MB')

  const { region, bucket } = getVanDamageAwsEnv()
  const key = `tenants/${input.tenantId}/fleet-maintenance/${input.businessId}/items/${input.itemId}/${input.attachmentId}-${safeFileName(input.filename)}`
  const result = await new S3Client({ region, maxAttempts: 3 }).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
      ServerSideEncryption: 'AES256',
      Metadata: { maintenanceItemId: input.itemId, attachmentId: input.attachmentId },
    })
  )
  const db = getVanDamageServiceClient()
  const { error } = await db
    .from('fleet_maintenance_attachments')
    .update({
      s3_bucket: bucket,
      s3_key: key,
      s3_etag: result.ETag ?? null,
      status: 'uploaded',
      file_size_bytes: input.bytes.byteLength,
    })
    .eq('id', input.attachmentId)
    .eq('tenant_id', input.tenantId)
  if (error) throw new Error(error.message)
  return { bucket, key }
}

export async function persistSlackMaintenanceAttachments(input: {
  token: string
  tenantId: string
  businessId: string
  itemId: string
  files: Array<{
    id: string
    name: string
    mimetype: string | null
    size: number | null
    url: string | null
  }>
}) {
  const db = getVanDamageServiceClient()
  for (const file of input.files) {
    const { data: attachment } = await db
      .from('fleet_maintenance_attachments')
      .select('id,status')
      .eq('tenant_id', input.tenantId)
      .eq('slack_file_id', file.id)
      .maybeSingle()
    if (!attachment || attachment.status === 'uploaded') continue

    if (
      !file.url ||
      !file.mimetype ||
      !MAINTENANCE_ATTACHMENT_TYPES.has(file.mimetype) ||
      (file.size != null && file.size > MAX_MAINTENANCE_ATTACHMENT_BYTES)
    ) {
      await db
        .from('fleet_maintenance_attachments')
        .update({
          status: 'failed',
          metadata: { error: 'Unsupported, oversized, or unavailable Slack attachment' },
        })
        .eq('id', attachment.id)
      continue
    }

    try {
      await db
        .from('fleet_maintenance_attachments')
        .update({ status: 'downloading' })
        .eq('id', attachment.id)
      const response = await fetch(file.url, {
        headers: { Authorization: `Bearer ${input.token}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`Slack file download failed (${response.status})`)
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > MAX_MAINTENANCE_ATTACHMENT_BYTES)
        throw new Error('Slack attachment exceeds 25 MB')
      const bytes = new Uint8Array(await response.arrayBuffer())
      await uploadMaintenanceAttachment({
        attachmentId: attachment.id,
        tenantId: input.tenantId,
        businessId: input.businessId,
        itemId: input.itemId,
        filename: file.name,
        contentType: file.mimetype,
        bytes,
      })
    } catch (error) {
      await db
        .from('fleet_maintenance_attachments')
        .update({
          status: 'failed',
          metadata: {
            error:
              error instanceof Error ? error.message.slice(0, 300) : 'Attachment upload failed',
          },
        })
        .eq('id', attachment.id)
    }
  }
}
