import { createClient } from '@supabase/supabase-js'
import { config as loadEnvironment } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { decryptSecret } from '../lib/server/crypto/encrypt-token'
import { vanDamageJobSchema, type VanDamageJobV1 } from '../lib/van-damage/contracts'
import { sha256Hex } from '../lib/van-damage/image-lifecycle'
import { getConfig } from '../workers/van-damage-worker/src/config'
import {
  downloadSlackImage,
  getSlackFileInfo,
  type SlackFileInfo,
} from '../workers/van-damage-worker/src/slack-client'
import { S3Storage } from '../workers/van-damage-worker/src/s3-storage'
import { SupabaseWorker } from '../workers/van-damage-worker/src/supabase-worker'

loadEnvironment({ path: '.env.local' })

type ImageRow = {
  id: string
  inspection_id: string
  slack_file_id: string
  slack_file_url: string | null
  content_type: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  metadata: Record<string, unknown> | null
  duplicate_of_image_id: string | null
}

function readArgs() {
  const values = process.argv.slice(2)
  const valueAfter = (name: string) => {
    const index = values.indexOf(name)
    return index >= 0 ? values[index + 1] : undefined
  }
  const requestedTenantId = valueAfter('--tenant')
  const singleTenant = values.includes('--single-tenant')
  const expectedCount = Number(valueAfter('--confirm-image-count'))
  const execute = values.includes('--execute')
  if ((!requestedTenantId && !singleTenant) || (requestedTenantId && singleTenant)) {
    throw new Error(
      'Usage: tsx scripts/restore-missing-van-images.ts (--tenant UUID | --single-tenant) [--execute --confirm-image-count N]'
    )
  }
  if (execute && (!Number.isInteger(expectedCount) || expectedCount < 1)) {
    throw new Error('--execute requires --confirm-image-count N.')
  }
  return { requestedTenantId, singleTenant, expectedCount, execute }
}

function fileFromStoredMetadata(image: ImageRow): SlackFileInfo | null {
  if (!image.slack_file_url || !image.content_type) return null
  return {
    id: image.slack_file_id,
    name:
      typeof image.metadata?.name === 'string'
        ? image.metadata.name
        : image.slack_file_id,
    mimetype: image.content_type,
    size: image.file_size_bytes,
    width: image.width,
    height: image.height,
    downloadUrl: image.slack_file_url,
  }
}

async function main() {
  const { requestedTenantId, singleTenant, expectedCount, execute } = readArgs()
  const config = getConfig()
  const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let tenantId = requestedTenantId
  if (singleTenant) {
    const { data: scopes, error: scopeError } = await db
      .from('van_damage_images')
      .select('tenant_id')
    if (scopeError) throw new Error(scopeError.message)
    const tenantIds = [...new Set((scopes ?? []).map((row) => row.tenant_id))]
    if (tenantIds.length !== 1) {
      throw new Error(
        `--single-tenant requires exactly one image tenant; found ${tenantIds.length}.`
      )
    }
    tenantId = tenantIds[0]
  }
  if (!tenantId) throw new Error('A tenant scope could not be resolved.')
  const [{ data: images, error: imageError }, { data: jobs, error: jobError }] =
    await Promise.all([
      db
        .from('van_damage_images')
        .select(
          'id,inspection_id,slack_file_id,slack_file_url,content_type,file_size_bytes,width,height,metadata,duplicate_of_image_id'
        )
        .eq('tenant_id', tenantId)
        .not('slack_file_id', 'is', null)
        .order('created_at', { ascending: true }),
      db
        .from('van_damage_jobs')
        .select('image_id,inspection_id,payload,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    ])
  if (imageError) throw new Error(imageError.message)
  if (jobError) throw new Error(jobError.message)

  const typedImages = (images ?? []) as ImageRow[]
  const payloadByImage = new Map<string, VanDamageJobV1>()
  const payloadByInspection = new Map<string, VanDamageJobV1>()
  for (const row of jobs ?? []) {
    const parsed = vanDamageJobSchema.safeParse(row.payload)
    if (!parsed.success) continue
    if (row.image_id && !payloadByImage.has(row.image_id)) {
      payloadByImage.set(row.image_id, parsed.data)
    }
    if (row.inspection_id && !payloadByInspection.has(row.inspection_id)) {
      payloadByInspection.set(row.inspection_id, parsed.data)
    }
  }
  for (const image of typedImages) {
    if (payloadByImage.has(image.id)) continue
    const template = payloadByInspection.get(image.inspection_id)
    if (!template) continue
    const reconstructed = vanDamageJobSchema.safeParse({
      ...template,
      jobId: randomUUID(),
      inspectionId: image.inspection_id,
      imageId: image.id,
      slackFileId: image.slack_file_id,
      slackFileIds: [image.slack_file_id],
      createdAt: new Date().toISOString(),
    })
    if (reconstructed.success) payloadByImage.set(image.id, reconstructed.data)
  }
  const imagesWithoutPayload = typedImages.filter(
    (image) => !payloadByImage.has(image.id)
  )
  if (imagesWithoutPayload.length) {
    const inspectionIds = [
      ...new Set(imagesWithoutPayload.map((image) => image.inspection_id)),
    ]
    const [integrationResult, inspectionResult] = await Promise.all([
      db
        .from('van_slack_integrations')
        .select('id,business_id,slack_team_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'connected')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1),
      db
        .from('van_damage_inspections')
        .select(
          'id,business_id,slack_channel_id,slack_message_ts,slack_thread_ts,title,metadata,created_at'
        )
        .eq('tenant_id', tenantId)
        .in('id', inspectionIds),
    ])
    if (integrationResult.error) throw new Error(integrationResult.error.message)
    if (inspectionResult.error) throw new Error(inspectionResult.error.message)
    const integration = integrationResult.data?.[0]
    if (!integration) throw new Error('No connected Slack integration was found.')
    const inspectionById = new Map(
      (inspectionResult.data ?? []).map((inspection) => [inspection.id, inspection])
    )
    for (const image of imagesWithoutPayload) {
      const inspection = inspectionById.get(image.inspection_id)
      if (!inspection) continue
      const metadata = (inspection.metadata ?? {}) as Record<string, unknown>
      const fallback = vanDamageJobSchema.safeParse({
        version: 'v1',
        jobType: 'van_damage_slack_inspection',
        jobId: randomUUID(),
        tenantId,
        businessId: inspection.business_id,
        integrationId: integration.id,
        inspectionId: image.inspection_id,
        imageId: image.id,
        slackFileId: image.slack_file_id,
        slackFileIds: [image.slack_file_id],
        analysisVersion: 'van-damage-v2',
        slackTeamId: integration.slack_team_id,
        slackChannelId: inspection.slack_channel_id ?? 'recovery-channel',
        slackMessageTs: inspection.slack_message_ts ?? inspection.created_at,
        slackThreadTs: inspection.slack_thread_ts,
        slackEventId:
          typeof metadata.slackEventId === 'string'
            ? metadata.slackEventId
            : `recovery:${inspection.id}`,
        slackMessageText: inspection.title ?? '',
        createdAt: new Date().toISOString(),
      })
      if (fallback.success) payloadByImage.set(image.id, fallback.data)
    }
  }
  const restorable = typedImages.filter((image) => payloadByImage.has(image.id))
  const skippedWithoutJob = typedImages.length - restorable.length

  console.info(
    JSON.stringify({
      mode: execute ? 'execute' : 'dry-run',
      imageRows: typedImages.length,
      restorableImages: restorable.length,
      skippedWithoutJob,
    })
  )
  if (!execute) return
  if (expectedCount !== restorable.length) {
    throw new Error(
      `Refusing restoration: expected ${expectedCount} images but found ${restorable.length}.`
    )
  }

  const storage = new S3Storage(config)
  const persistence = new SupabaseWorker(config)
  let restored = 0
  const failures: Array<{ message: string }> = []

  for (const [index, image] of restorable.entries()) {
    const job = payloadByImage.get(image.id)!
    try {
      const context = await persistence.loadIntegrationForJob(job)
      const token = decryptSecret(context.integration.encrypted_bot_token)
      const current = context.images[0]
      if (!current || current.id !== image.id) {
        throw new Error('The image no longer matches its recovery job.')
      }
      const file =
        fileFromStoredMetadata(image) ??
        (await getSlackFileInfo(token, image.slack_file_id))
      const body = await downloadSlackImage(token, file, config.maxImageBytes)
      const sourceSha256 = sha256Hex(body)
      const { data: inspection, error: inspectionError } = await db
        .from('van_damage_inspections')
        .select('van_id')
        .eq('tenant_id', tenantId)
        .eq('id', image.inspection_id)
        .single()
      if (inspectionError) throw new Error(inspectionError.message)
      const vanId = inspection?.van_id ?? null

      const original = await storage.uploadOriginal({
        tenantId: job.tenantId,
        businessId: job.businessId,
        inspectionId: job.inspectionId,
        imageId: image.id,
        vehicleId: vanId,
        slackFileId: file.id,
        fileName: file.name,
        contentType: file.mimetype,
        body,
        sha256: sourceSha256,
      })
      await persistence.upsertImageS3Info(job, image.id, {
        ...original,
        contentType: file.mimetype,
        size: body.length,
        width: file.width,
        height: file.height,
      })
      await persistence.upsertOriginalAsset({
        job,
        imageId: image.id,
        vanId,
        ...original,
        contentType: file.mimetype,
        size: body.length,
        width: file.width,
        height: file.height,
        sha256: sourceSha256,
        source: 'slack',
      })

      const derivatives = await storage.uploadDerivatives({
        tenantId: job.tenantId,
        businessId: job.businessId,
        inspectionId: job.inspectionId,
        imageId: image.id,
        vehicleId: vanId,
        body,
      })
      await persistence.upsertDerivativeAssets({
        job,
        imageId: image.id,
        vanId,
        sourceSha256,
        derivatives,
      })
      const { error: duplicateError } = await db
        .from('van_damage_images')
        .update({
          original_sha256: sourceSha256,
          duplicate_status: image.duplicate_of_image_id ? 'exact_duplicate' : 'unique',
        })
        .eq('tenant_id', tenantId)
        .eq('id', image.id)
      if (duplicateError) throw new Error(duplicateError.message)

      restored += 1
      console.info(
        JSON.stringify({
          event: 'van_damage.image_restored',
          progress: `${index + 1}/${restorable.length}`,
        })
      )
    } catch (error) {
      failures.push({
        message: error instanceof Error ? error.message : 'Unknown restoration failure',
      })
      console.error(
        JSON.stringify({
          event: 'van_damage.image_restore_failed',
          progress: `${index + 1}/${restorable.length}`,
          message: error instanceof Error ? error.message : 'Unknown restoration failure',
        })
      )
    }
  }

  await db.from('activity_logs').insert({
    tenant_id: tenantId,
    actor_type: 'system',
    action: 'van_damage.images_restored_from_slack',
    entity_type: 'van_damage_image',
    metadata: {
      requested_image_count: restorable.length,
      restored_image_count: restored,
      failed_image_count: failures.length,
    },
  })
  console.info(
    JSON.stringify({
      mode: 'execute',
      requestedImages: restorable.length,
      restoredImages: restored,
      failedImages: failures.length,
    })
  )
  if (failures.length) process.exitCode = 1
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Image restoration failed.')
  process.exitCode = 1
})
