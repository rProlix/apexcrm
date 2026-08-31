import dotenv from 'dotenv'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { S3Storage } from '../src/s3-storage.js'
import type { WorkerConfig } from '../src/config.js'
import { downloadSlackImage, getSlackFileInfo } from '../src/slack-client.js'
import { decryptSecret, type EncryptedSecret } from '../../../lib/server/crypto/encrypt-token.js'
import {
  DERIVATIVE_RENDER_VERSION,
  resolveImageRetentionPolicy,
  sha256Hex,
  type ImageDerivativeProfile,
} from '../../../lib/van-damage/image-lifecycle.js'

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? '.env' })

type ImageRow = {
  id: string
  tenant_id: string
  business_id: string
  inspection_id: string
  s3_bucket: string
  s3_key: string
  content_type: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  original_sha256: string | null
  slack_file_id: string | null
}

type InspectionSource = { vanId: string | null; slackTeamId: string | null }

const profiles: ImageDerivativeProfile[] = ['thumbnail', 'medium', 'large']
const args = new Set(process.argv.slice(2))
const execute = args.has('--execute')
const limit = numberArg('--limit', 500)
const concurrency = Math.min(4, Math.max(1, numberArg('--concurrency', 2)))

const required = {
  awsRegion: requireEnv('AWS_REGION', process.env.AWS_REGION),
  bucket: requireEnv(
    'VAN_DAMAGE_S3_BUCKET',
    process.env.VAN_DAMAGE_S3_BUCKET ?? process.env.S3_BUCKET
  ),
  supabaseUrl: requireEnv('SUPABASE_URL', process.env.SUPABASE_URL),
  supabaseServiceRoleKey: requireEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
}

const workerConfig = {
  nodeEnv: 'production',
  awsRegion: required.awsRegion,
  bucket: required.bucket,
  supabaseUrl: required.supabaseUrl,
  supabaseServiceRoleKey: required.supabaseServiceRoleKey,
  queueUrl: process.env.VAN_DAMAGE_SQS_QUEUE_URL ?? 'https://sqs.invalid/unused',
  geminiApiKey: process.env.GEMINI_API_KEY ?? 'unused-backfill-key',
  geminiModel: process.env.GEMINI_MODEL ?? 'unused',
  encryptionKey: process.env.SLACK_TOKEN_ENCRYPTION_KEY ?? 'unused',
  concurrency: 1,
  visibilityTimeoutSeconds: 300,
  maxImageBytes: 30 * 1024 * 1024,
  maxGeminiRawBytes: 12 * 1024 * 1024,
  scrollProcessingConcurrency: 1,
  scrollMaxDurationSeconds: 180,
  scrollMaxUploadBytes: 512 * 1024 * 1024,
  scrollMaxSourceWidth: 3840,
  scrollMaxSourceHeight: 3840,
  scrollDesktopMaxWidth: 1920,
  scrollMobileMaxWidth: 720,
  scrollMinFreeDiskBytes: 2 * 1024 * 1024 * 1024,
  logLevel: 'info',
} satisfies WorkerConfig

const db = createClient(required.supabaseUrl, required.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const s3 = new S3Client({ region: required.awsRegion, maxAttempts: 3 })
const storage = new S3Storage(workerConfig)
const tokenByWorkspace = new Map<string, EncryptedSecret>()

async function main() {
  const { data: images, error: imageError } = await db
    .from('van_damage_images')
    .select(
      'id,tenant_id,business_id,inspection_id,s3_bucket,s3_key,content_type,file_size_bytes,width,height,original_sha256,slack_file_id'
    )
    .not('s3_bucket', 'is', null)
    .not('s3_key', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (imageError) throw new Error(imageError.message)

  const imageRows = (images ?? []) as ImageRow[]
  if (!imageRows.length) {
    console.log('No stored van images require inspection.')
    return
  }

  const imageIds = imageRows.map((image) => image.id)
  const inspectionIds = [...new Set(imageRows.map((image) => image.inspection_id))]
  const [{ data: assets, error: assetError }, { data: inspections, error: inspectionError }] =
    await Promise.all([
      db
        .from('van_damage_image_assets')
        .select('image_id,derivative_profile,status')
        .in('image_id', imageIds)
        .eq('status', 'active'),
      db.from('van_damage_inspections').select('id,van_id,slack_team_id').in('id', inspectionIds),
    ])
  if (assetError) throw new Error(assetError.message)
  if (inspectionError) throw new Error(inspectionError.message)

  const existing = new Map<string, Set<string>>()
  for (const asset of assets ?? []) {
    const imageId = String(asset.image_id)
    const current = existing.get(imageId) ?? new Set<string>()
    current.add(String(asset.derivative_profile))
    existing.set(imageId, current)
  }
  const sourceByInspection = new Map<string, InspectionSource>(
    (inspections ?? []).map((inspection) => [
      String(inspection.id),
      {
        vanId: inspection.van_id ? String(inspection.van_id) : null,
        slackTeamId: inspection.slack_team_id ? String(inspection.slack_team_id) : null,
      },
    ])
  )
  const tenantIds = [...new Set(missingTenantIds(imageRows))]
  const { data: integrations, error: integrationError } = await db
    .from('van_slack_integrations')
    .select('tenant_id,slack_team_id,encrypted_bot_token,updated_at')
    .in('tenant_id', tenantIds)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (integrationError) throw new Error(integrationError.message)
  for (const integration of integrations ?? []) {
    const key = `${integration.tenant_id}:${integration.slack_team_id}`
    if (!tokenByWorkspace.has(key) && integration.encrypted_bot_token) {
      tokenByWorkspace.set(key, integration.encrypted_bot_token as EncryptedSecret)
    }
  }
  const missing = imageRows.filter((image) =>
    profiles.some((profile) => !existing.get(image.id)?.has(profile))
  )

  console.log(
    JSON.stringify({
      mode: execute ? 'execute' : 'dry-run',
      storedImages: imageRows.length,
      imagesMissingDerivatives: missing.length,
      profiles,
      concurrency,
    })
  )
  if (!execute || !missing.length) return

  let completed = 0
  let failed = 0
  let nextIndex = 0
  const failures: string[] = []

  async function worker() {
    while (nextIndex < missing.length) {
      const image = missing[nextIndex++]
      try {
        await backfillImage(
          image,
          sourceByInspection.get(image.inspection_id) ?? {
            vanId: null,
            slackTeamId: null,
          }
        )
        completed += 1
        console.log(`Backfilled ${completed}/${missing.length}`)
      } catch (error) {
        failed += 1
        failures.push(error instanceof Error ? error.message : String(error))
        console.error(`Backfill failed (${failed})`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  console.log(JSON.stringify({ completed, failed, total: missing.length }))
  if (failures.length) {
    console.error([...new Set(failures)].slice(0, 5).join('\n'))
    process.exitCode = 1
  }
}

async function backfillImage(image: ImageRow, inspection: InspectionSource) {
  const source = await loadSourceImage(image, inspection)
  const body = source.body
  if (!body.length || body.length > workerConfig.maxImageBytes) {
    throw new Error('Original image is empty or exceeds the backfill limit')
  }

  const sourceSha256 = image.original_sha256 ?? source.sha256
  const derivatives = await storage.uploadDerivatives({
    tenantId: image.tenant_id,
    businessId: image.business_id,
    inspectionId: image.inspection_id,
    imageId: image.id,
    vehicleId: inspection.vanId,
    body,
  })
  const originalRetention = resolveImageRetentionPolicy({
    assetType: 'original',
    uploadedAt: new Date(),
  })
  const original = {
    tenant_id: image.tenant_id,
    business_id: image.business_id,
    inspection_id: image.inspection_id,
    image_id: image.id,
    vehicle_id: inspection.vanId,
    asset_type: 'original',
    derivative_profile: 'original',
    derivative_version: 'original',
    storage_provider: 's3',
    bucket: source.bucket,
    object_key: source.key,
    content_type: source.contentType,
    byte_size: source.size,
    width: source.width,
    height: source.height,
    sha256: sourceSha256,
    source_sha256: sourceSha256,
    source: 'system',
    status: 'active',
    retention_until: originalRetention.retainUntil,
    deletion_eligible_at: originalRetention.deletionEligibleAt,
    lifecycle_policy_version: originalRetention.policyVersion,
    metadata: { backfilled: true },
  }
  const derivativeRows = derivatives.map((derivative) => {
    const retention = resolveImageRetentionPolicy({
      assetType: derivative.profile,
      uploadedAt: new Date(),
    })
    return {
      tenant_id: image.tenant_id,
      business_id: image.business_id,
      inspection_id: image.inspection_id,
      image_id: image.id,
      vehicle_id: inspection.vanId,
      asset_type: derivative.profile,
      derivative_profile: derivative.profile,
      derivative_version: DERIVATIVE_RENDER_VERSION,
      storage_provider: 's3',
      bucket: derivative.bucket,
      object_key: derivative.key,
      content_type: derivative.contentType,
      byte_size: derivative.size,
      width: derivative.width,
      height: derivative.height,
      source_sha256: sourceSha256,
      source: 'system',
      status: 'active',
      cache_control: 'private, max-age=31536000, immutable',
      retention_until: retention.retainUntil,
      deletion_eligible_at: retention.deletionEligibleAt,
      lifecycle_policy_version: retention.policyVersion,
      metadata: {
        backfilled: true,
        quality: derivative.quality,
        rendererVersion: DERIVATIVE_RENDER_VERSION,
      },
    }
  })

  const { error } = await db.from('van_damage_image_assets').upsert([original, ...derivativeRows], {
    onConflict: 'tenant_id,image_id,asset_type,derivative_profile,derivative_version',
  })
  if (error) throw new Error(error.message)
  if (!image.original_sha256) {
    await db
      .from('van_damage_images')
      .update({ original_sha256: sourceSha256 })
      .eq('id', image.id)
      .eq('tenant_id', image.tenant_id)
  }
}

async function loadSourceImage(image: ImageRow, inspection: InspectionSource) {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: image.s3_bucket, Key: image.s3_key })
    )
    if (!response.Body) throw new Error('Original image body is missing')
    const body = Buffer.from(await response.Body.transformToByteArray())
    return {
      body,
      bucket: image.s3_bucket,
      key: image.s3_key,
      contentType: image.content_type ?? 'application/octet-stream',
      size: image.file_size_bytes ?? body.length,
      width: image.width,
      height: image.height,
      sha256: sha256Hex(body),
    }
  } catch (error) {
    if (!isMissingS3Object(error)) throw error
  }

  if (!image.slack_file_id || !inspection.slackTeamId) {
    throw new Error('Original S3 object is missing and Slack recovery data is incomplete')
  }
  const encryptedToken = tokenByWorkspace.get(`${image.tenant_id}:${inspection.slackTeamId}`)
  if (!encryptedToken) {
    throw new Error('Original S3 object is missing and no connected Slack workspace is available')
  }
  const token = decryptSecret(encryptedToken)
  const file = await getSlackFileInfo(token, image.slack_file_id)
  const body = await downloadSlackImage(token, file, workerConfig.maxImageBytes)
  const sha256 = sha256Hex(body)
  const uploaded = await storage.uploadOriginal({
    tenantId: image.tenant_id,
    businessId: image.business_id,
    inspectionId: image.inspection_id,
    imageId: image.id,
    vehicleId: inspection.vanId,
    slackFileId: file.id,
    fileName: file.name,
    contentType: file.mimetype,
    body,
    sha256,
  })
  const { error: updateError } = await db
    .from('van_damage_images')
    .update({
      s3_bucket: uploaded.bucket,
      s3_key: uploaded.key,
      s3_etag: uploaded.etag,
      content_type: file.mimetype,
      file_size_bytes: body.length,
      width: file.width,
      height: file.height,
      original_sha256: sha256,
    })
    .eq('id', image.id)
    .eq('tenant_id', image.tenant_id)
  if (updateError) throw new Error(updateError.message)
  return {
    body,
    bucket: uploaded.bucket,
    key: uploaded.key,
    contentType: file.mimetype,
    size: body.length,
    width: file.width,
    height: file.height,
    sha256,
  }
}

function numberArg(name: string, fallback: number) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function missingTenantIds(images: ImageRow[]) {
  return images.map((image) => image.tenant_id)
}

function isMissingS3Object(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  return (
    value.name === 'NoSuchKey' ||
    value.Code === 'NoSuchKey' ||
    value.$metadata?.httpStatusCode === 404
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
