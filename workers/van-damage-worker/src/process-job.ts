import { vanDamageJobSchema, VAN_DAMAGE_IMAGE_MIME_TYPES, type VanDamageJobV1 } from '../../../lib/van-damage/contracts.js'
import { decryptSecret } from '../../../lib/server/crypto/encrypt-token.js'
import { getConfig, type WorkerConfig } from './config.js'
import { logger } from './logger.js'
import { getSlackFileInfo, downloadSlackImage, PermanentSlackFileError, type SlackFileInfo } from './slack-client.js'
import { S3Storage } from './s3-storage.js'
import { analyzeVanDamage, getDamagePromptVersion } from './gemini-damage-analysis.js'
import { SupabaseWorker, type WorkerVanProfile } from './supabase-worker.js'
import { extractVanNumber } from './van-number-parser.js'

export type ProcessResult = 'success' | 'retry'

type PersistencePort = Pick<SupabaseWorker,
  'claimJob' | 'loadIntegrationForJob' | 'markInspectionAnalyzing' | 'upsertImageS3Info' |
  'createAiRun' | 'saveAiRawResponse' | 'replaceDamageItemsAndComplete' | 'markJobFailed' |
  'getOrCreateVanByNumber' | 'attachInspectionToVan' | 'markInspectionNeedsReview' |
  'updateVanProfileAfterInspection'
>
type StoragePort = Pick<S3Storage, 'uploadOriginal'>

export async function processMessageBody(body: string, dependencies?: {
  config?: WorkerConfig
  persistence?: PersistencePort
  storage?: StoragePort
}): Promise<ProcessResult> {
  const parsedJson = (() => { try { return JSON.parse(body) as unknown } catch { return null } })()
  const parsed = vanDamageJobSchema.safeParse(parsedJson)
  if (!parsed.success) {
    logger.error('Invalid SQS message payload', { issues: parsed.error.issues.map((issue) => issue.message) })
    return 'retry'
  }
  const job = parsed.data
  const config = dependencies?.config ?? getConfig()
  const persistence = dependencies?.persistence ?? new SupabaseWorker(config)
  const storage = dependencies?.storage ?? new S3Storage(config)

  const staleBefore = new Date(Date.now() - config.visibilityTimeoutSeconds * 2_000).toISOString()
  const claim = await persistence.claimJob(job, staleBefore)
  if (claim === 'completed') return 'success'
  if (claim === 'busy') return 'retry'
  if (claim === 'missing') {
    logger.error('SQS message references a missing job', { jobId: job.jobId })
    return 'retry'
  }

  try {
    const context = await persistence.loadIntegrationForJob(job)
    const token = decryptSecret(context.integration.encrypted_bot_token)
    const slackMessageText = job.slackMessageText || stringFromMetadata(context.inspection.metadata.slackMessageText)
    const vanNumber = extractVanNumber(slackMessageText)
    let vanProfile: WorkerVanProfile | null = null
    if (vanNumber) {
      vanProfile = await persistence.getOrCreateVanByNumber({
        tenantId: job.tenantId,
        businessId: job.businessId,
        vanNumber,
      })
      await persistence.attachInspectionToVan(job, vanProfile, vanNumber)
    }
    const analysisImages: Array<{ id: string; contentType: string; data: Buffer; role?: string | null }> = []
    const imageIds: string[] = []

    for (const image of context.images) {
      if (!image.slack_file_id || !job.slackFileIds.includes(image.slack_file_id)) continue
      let file: SlackFileInfo
      if (image.slack_file_url && image.content_type && VAN_DAMAGE_IMAGE_MIME_TYPES.includes(image.content_type as typeof VAN_DAMAGE_IMAGE_MIME_TYPES[number])) {
        file = {
          id: image.slack_file_id,
          name: typeof image.metadata?.name === 'string' ? image.metadata.name : image.slack_file_id,
          mimetype: image.content_type,
          size: image.file_size_bytes,
          width: image.width,
          height: image.height,
          downloadUrl: image.slack_file_url,
        }
      } else {
        file = await getSlackFileInfo(token, image.slack_file_id)
      }
      const data = await downloadSlackImage(token, file, config.maxImageBytes)
      const uploaded = await storage.uploadOriginal({
        tenantId: job.tenantId, businessId: job.businessId, inspectionId: job.inspectionId,
        slackFileId: file.id, fileName: file.name, contentType: file.mimetype, body: data,
      })
      await persistence.upsertImageS3Info(job, image.id, {
        ...uploaded, contentType: file.mimetype, size: data.length, width: file.width, height: file.height,
      })
      analysisImages.push({ id: image.id, contentType: file.mimetype, data, role: image.image_role })
      imageIds.push(image.id)
    }

    if (!analysisImages.length) throw new PermanentSlackFileError('No supported Slack images were available')
    if (!vanNumber) {
      const reason = 'Missing van number in Slack message text'
      await persistence.markInspectionNeedsReview(job, reason)
      await completePermanentReview(job, persistence, config, reason, imageIds)
      logger.warn('Van Damage job completed as needs_review', { jobId: job.jobId, reason })
      return 'success'
    }
    await persistence.markInspectionAnalyzing(job, config.geminiModel)
    const aiRunId = await persistence.createAiRun(job, config.geminiModel, getDamagePromptVersion(), {
      imageCount: analysisImages.length,
      slackEventId: job.slackEventId,
      slackMessageText,
      vanNumber,
    })
    const result = await analyzeVanDamage({
      config,
      images: analysisImages,
      context: [context.inspection.title, `Van ${vanNumber}`].filter(Boolean).join(' - '),
    })
    await persistence.saveAiRawResponse(job, aiRunId, result.rawText, result.parseError)
    await persistence.replaceDamageItemsAndComplete({ job, aiRunId, analysis: result.analysis, imageIds })
    if (vanProfile) {
      await persistence.updateVanProfileAfterInspection({
        tenantId: job.tenantId,
        vanId: vanProfile.id,
        inspectionId: job.inspectionId,
        summary: result.analysis.summary,
        damageCount: result.analysis.damageCount,
        imageCount: imageIds.length,
      })
    }
    logger.info('Van Damage job completed', { jobId: job.jobId, inspectionId: job.inspectionId, needsReview: result.analysis.needsHumanReview })
    return 'success'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof PermanentSlackFileError) {
      try {
        await completePermanentReview(job, persistence, config, message, [])
        logger.warn('Van Damage job completed as needs_review', { jobId: job.jobId, reason: message })
        return 'success'
      } catch (reviewError) {
        await persistence.markJobFailed(job, reviewError instanceof Error ? reviewError.message : String(reviewError))
        return 'retry'
      }
    }
    await persistence.markJobFailed(job, message)
    logger.error('Van Damage job failed; leaving SQS message for retry', { jobId: job.jobId, error: message })
    return 'retry'
  }
}

function stringFromMetadata(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function completePermanentReview(
  job: VanDamageJobV1,
  persistence: PersistencePort,
  config: WorkerConfig,
  reason: string,
  imageIds: string[],
) {
  const aiRunId = await persistence.createAiRun(job, config.geminiModel, getDamagePromptVersion(), { permanentValidationError: reason })
  const analysis = {
    summary: 'Automated analysis could not process the supplied images.',
    overallConfidence: 0,
    damageCount: 0,
    vehicleCondition: 'unknown' as const,
    items: [],
    needsHumanReview: true,
    warnings: [reason],
  }
  await persistence.saveAiRawResponse(job, aiRunId, '', reason)
  await persistence.replaceDamageItemsAndComplete({ job, aiRunId, analysis, imageIds })
}
