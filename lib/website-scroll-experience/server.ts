import 'server-only'

import { randomUUID } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserContext } from '@/lib/auth/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getScrollExperienceAwsEnv, getScrollExperienceLimits } from '@/lib/server/env'
import {
  buildScrollExperienceIdempotencyKey,
  buildScrollExperienceObjectKey,
  isMp4Signature,
  scrollExperienceJobSchema,
} from './contracts'

let s3: S3Client | null = null
let sqs: SQSClient | null = null

function clients(region: string) {
  s3 ??= new S3Client({ region, maxAttempts: 3 })
  sqs ??= new SQSClient({ region, maxAttempts: 3 })
  return { s3, sqs }
}

function db(): SupabaseClient {
  return getSupabaseServerClient() as SupabaseClient
}

export async function resolveScrollTenant(ctx: UserContext | null, requestedTenantId?: unknown) {
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return null
  if (ctx.role === 'admin') return ctx.tenant_id
  const candidate = typeof requestedTenantId === 'string' ? requestedTenantId : ctx.tenant_id
  if (!candidate) return null
  const { data } = await db().from('tenants').select('id').eq('id', candidate).maybeSingle()
  return data?.id as string | null
}

export async function assertScrollExperienceEntitlement(tenantId: string) {
  const { data } = await db()
    .from('tenant_modules')
    .select('enabled,config')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'website')
    .maybeSingle()
  if (data?.enabled === false) throw new Error('Website Builder is not enabled for this business.')
  const config =
    data?.config && typeof data.config === 'object' ? (data.config as Record<string, unknown>) : {}
  if (config.scroll_experience_enabled === false) {
    throw new Error('Scroll Experience is not included in this package.')
  }
}

export async function assertPageOwnership(tenantId: string, pageId?: unknown) {
  if (typeof pageId !== 'string' || !pageId) return null
  const { data } = await db()
    .from('site_pages')
    .select('id')
    .eq('id', pageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data) throw new Error('Website page not found.')
  return data.id as string
}

export async function createScrollExperienceUpload(input: {
  tenantId: string
  actorId: string
  pageId?: string | null
  websiteId?: string | null
  componentInstanceId?: string | null
  name: string
  fileName: string
  contentType: string
  bytes: number
}) {
  const limits = getScrollExperienceLimits()
  if (!['video/mp4', 'application/mp4'].includes(input.contentType)) {
    throw new Error('Choose an MP4 video.')
  }
  if (!input.fileName.toLowerCase().endsWith('.mp4')) throw new Error('Choose an MP4 video.')
  if (
    !Number.isSafeInteger(input.bytes) ||
    input.bytes <= 0 ||
    input.bytes > limits.maxUploadBytes
  ) {
    throw new Error(
      `Video must be smaller than ${Math.floor(limits.maxUploadBytes / 1024 / 1024)} MB.`
    )
  }

  const database = db()
  const experienceId = randomUUID()
  const experienceVersionId = randomUUID()
  const { error: experienceError } = await database.from('website_scroll_experiences').insert({
    id: experienceId,
    tenant_id: input.tenantId,
    website_id: input.websiteId ?? null,
    page_id: input.pageId ?? null,
    component_instance_id: input.componentInstanceId ?? null,
    name: input.name.trim().slice(0, 120) || 'Untitled Scroll Experience',
    status: 'UPLOADING',
    created_by: input.actorId,
  })
  if (experienceError) throw new Error('Could not create Scroll Experience.')

  const { error: versionError } = await database.from('website_scroll_experience_versions').insert({
    id: experienceVersionId,
    tenant_id: input.tenantId,
    experience_id: experienceId,
    version_number: 1,
    status: 'UPLOADING',
    processing_version: limits.processingVersion,
    source_bytes: input.bytes,
    created_by: input.actorId,
  })
  if (versionError) throw new Error('Could not create the video processing version.')

  await database
    .from('website_scroll_experiences')
    .update({ active_version_id: experienceVersionId })
    .eq('id', experienceId)
    .eq('tenant_id', input.tenantId)

  const config = getScrollExperienceAwsEnv()
  const objectKey = buildScrollExperienceObjectKey({
    tenantId: input.tenantId,
    experienceId,
    experienceVersionId,
    kind: 'source',
  })
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: 'video/mp4',
    ContentLength: input.bytes,
    Metadata: {
      tenant_id: input.tenantId,
      experience_id: experienceId,
      experience_version_id: experienceVersionId,
      asset_kind: 'source',
    },
    Tagging: new URLSearchParams({
      'tenant-id': input.tenantId,
      'asset-type': 'scroll-source',
      'retention-class': 'source',
      'legal-hold': 'false',
    }).toString(),
  })
  const uploadUrl = await getSignedUrl(clients(config.region).s3, command, { expiresIn: 15 * 60 })

  await recordScrollAudit(
    input.tenantId,
    experienceId,
    'SCROLL_EXPERIENCE_CREATED',
    input.actorId,
    { version: 1 }
  )
  await recordScrollAudit(
    input.tenantId,
    experienceId,
    'SCROLL_VIDEO_UPLOAD_STARTED',
    input.actorId,
    { bytes: input.bytes }
  )
  return {
    experienceId,
    experienceVersionId,
    objectKey,
    uploadUrl,
    expiresInSeconds: 900,
    maxUploadBytes: limits.maxUploadBytes,
  }
}

async function bodyBytes(body: unknown): Promise<Uint8Array> {
  if (!body || typeof body !== 'object' || !('transformToByteArray' in body))
    return new Uint8Array()
  const transform = (body as { transformToByteArray: () => Promise<Uint8Array> })
    .transformToByteArray
  return transform.call(body)
}

export async function completeScrollExperienceUpload(input: {
  tenantId: string
  actorId: string
  experienceId: string
  experienceVersionId: string
}) {
  const database = db()
  const { data: version } = await database
    .from('website_scroll_experience_versions')
    .select('id,status,processing_version,source_bytes')
    .eq('id', input.experienceVersionId)
    .eq('experience_id', input.experienceId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()
  if (!version) throw new Error('Scroll Experience upload not found.')
  if (
    [
      'QUEUED',
      'INSPECTING',
      'PROCESSING_DESKTOP',
      'PROCESSING_MOBILE',
      'GENERATING_POSTER',
      'READY',
    ].includes(String(version.status))
  ) {
    return {
      experienceId: input.experienceId,
      experienceVersionId: input.experienceVersionId,
      status: version.status,
    }
  }

  const config = getScrollExperienceAwsEnv()
  const objectKey = buildScrollExperienceObjectKey({ ...input, kind: 'source' })
  const storage = clients(config.region).s3
  const head = await storage.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
  const bytes = Number(head.ContentLength ?? 0)
  if (bytes <= 0 || bytes !== Number(version.source_bytes))
    throw new Error('Uploaded video size does not match the upload session.')
  if (!['video/mp4', 'application/mp4'].includes(String(head.ContentType)))
    throw new Error('Uploaded file is not an MP4 video.')
  const signature = await storage.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey, Range: 'bytes=0-15' })
  )
  if (!isMp4Signature(await bodyBytes(signature.Body)))
    throw new Error('Uploaded file is not a valid MP4 container.')

  const { data: asset, error: assetError } = await database
    .from('website_scroll_experience_assets')
    .upsert(
      {
        tenant_id: input.tenantId,
        experience_id: input.experienceId,
        experience_version_id: input.experienceVersionId,
        kind: 'source',
        bucket: config.bucket,
        object_key: objectKey,
        content_type: 'video/mp4',
        bytes,
        metadata: { etag: head.ETag?.replaceAll('"', '') ?? null },
      },
      { onConflict: 'tenant_id,experience_version_id,kind' }
    )
    .select('id')
    .single()
  if (assetError || !asset) throw new Error('Could not record the uploaded video.')

  const processingVersion = String(version.processing_version)
  const idempotencyKey = buildScrollExperienceIdempotencyKey(
    input.tenantId,
    input.experienceId,
    processingVersion
  )
  const { data: job, error: jobError } = await database
    .from('website_scroll_experience_jobs')
    .upsert(
      {
        tenant_id: input.tenantId,
        experience_id: input.experienceId,
        experience_version_id: input.experienceVersionId,
        source_asset_id: asset.id,
        idempotency_key: idempotencyKey,
        status: 'QUEUED',
      },
      { onConflict: 'idempotency_key' }
    )
    .select('id,queue_message_id')
    .single()
  if (jobError || !job) throw new Error('Could not queue video processing.')

  const payload = scrollExperienceJobSchema.parse({
    version: '1',
    jobType: 'scroll_experience_video',
    tenantId: input.tenantId,
    experienceId: input.experienceId,
    experienceVersionId: input.experienceVersionId,
    sourceAssetId: asset.id,
    processingVersion,
    idempotencyKey,
  })
  let messageId = job.queue_message_id as string | null
  if (!messageId) {
    const queued = await clients(config.region).sqs.send(
      new SendMessageCommand({
        QueueUrl: config.queueUrl,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          version: { DataType: 'String', StringValue: payload.version },
          jobType: { DataType: 'String', StringValue: payload.jobType },
        },
      }),
      { abortSignal: AbortSignal.timeout(3_000) }
    )
    messageId = queued.MessageId ?? null
    await database
      .from('website_scroll_experience_jobs')
      .update({ queue_message_id: messageId })
      .eq('id', job.id)
      .eq('tenant_id', input.tenantId)
  }

  await Promise.all([
    database
      .from('website_scroll_experience_versions')
      .update({ status: 'QUEUED' })
      .eq('id', input.experienceVersionId)
      .eq('tenant_id', input.tenantId),
    database
      .from('website_scroll_experiences')
      .update({ status: 'QUEUED' })
      .eq('id', input.experienceId)
      .eq('tenant_id', input.tenantId),
    recordScrollAudit(input.tenantId, input.experienceId, 'SCROLL_VIDEO_UPLOADED', input.actorId, {
      bytes,
    }),
  ])
  return {
    experienceId: input.experienceId,
    experienceVersionId: input.experienceVersionId,
    status: 'QUEUED',
    messageId,
  }
}

export async function recordScrollAudit(
  tenantId: string,
  experienceId: string,
  eventName: string,
  actorId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await db().from('website_scroll_experience_audit').insert({
    tenant_id: tenantId,
    experience_id: experienceId,
    event_name: eventName,
    actor_id: actorId,
    metadata,
  })
}
