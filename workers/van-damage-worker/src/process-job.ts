import {
  vanDamageJobSchema,
  VAN_DAMAGE_IMAGE_MIME_TYPES,
  type VanDamageJobV1,
} from '../../../lib/van-damage/contracts.js'
import { decryptSecret } from '../../../lib/server/crypto/encrypt-token.js'
import { getConfig, type WorkerConfig } from './config.js'
import { logger } from './logger.js'
import {
  getSlackFileInfo,
  downloadSlackImage,
  PermanentSlackFileError,
  type SlackFileInfo,
} from './slack-client.js'
import { S3Storage } from './s3-storage.js'
import { analyzeVanDamage, getDamagePromptVersion } from './gemini-damage-analysis.js'
import { SupabaseWorker, type WorkerVanProfile } from './supabase-worker.js'
import { extractVanNumber } from './van-number-parser.js'
import { sha256Hex } from '../../../lib/van-damage/image-lifecycle.js'
import { processScrollExperienceJob } from './scroll-experience-processor.js'

export type ProcessResult = 'success' | 'retry'
export type JobRuntimeMetadata = {
  sqsMessageId?: string
  receiveCount?: number
  retryCount?: number
}

type PersistencePort = Pick<
  SupabaseWorker,
  | 'claimJob'
  | 'loadIntegrationForJob'
  | 'findReusableOriginal'
  | 'markImageAsExactDuplicate'
  | 'upsertOriginalAsset'
  | 'upsertDerivativeAssets'
  | 'findReusableDamageAnalysis'
  | 'writeDamageAnalysisCache'
  | 'recordAiUsage'
  | 'upsertImageS3Info'
  | 'createAiRun'
  | 'saveAiRawResponse'
  | 'completeImageAnalysis'
  | 'markImageFailed'
  | 'getOrCreateVanByNumber'
  | 'attachInspectionToVan'
  | 'markInspectionNeedsReview'
  | 'updateVanProfileAfterInspection'
>
type StoragePort = Pick<S3Storage, 'uploadOriginal' | 'uploadDerivatives'>

export async function processMessageBody(
  body: string,
  dependencies?: {
    config?: WorkerConfig
    persistence?: PersistencePort
    storage?: StoragePort
    analyze?: typeof analyzeVanDamage
  },
  metadata: JobRuntimeMetadata = {}
): Promise<ProcessResult> {
  const parsedJson = (() => {
    try {
      return JSON.parse(body) as unknown
    } catch {
      return null
    }
  })()
  if (
    parsedJson &&
    typeof parsedJson === 'object' &&
    !Array.isArray(parsedJson) &&
    (parsedJson as Record<string, unknown>).jobType === 'scroll_experience_video'
  ) {
    return processScrollExperienceJob(parsedJson, dependencies?.config ?? getConfig(), metadata)
  }
  const parsed = vanDamageJobSchema.safeParse(parsedJson)
  if (!parsed.success) {
    logger.error('Invalid SQS message payload', {
      messageId: metadata.sqsMessageId,
      retryCount: metadata.retryCount ?? 0,
      issues: parsed.error.issues.map((issue) => issue.message),
    })
    return 'retry'
  }
  const job = parsed.data
  const startedAt = Date.now()
  const jobContext = {
    jobId: job.jobId,
    inspectionId: job.inspectionId,
    imageId: job.imageId,
    tenantId: job.tenantId,
    messageId: metadata.sqsMessageId,
    receiveCount: metadata.receiveCount ?? 1,
    retryCount: metadata.retryCount ?? 0,
  }
  const config = dependencies?.config ?? getConfig()
  const persistence = dependencies?.persistence ?? new SupabaseWorker(config)
  const storage = dependencies?.storage ?? new S3Storage(config)
  const analyze = dependencies?.analyze ?? analyzeVanDamage

  logger.info('Job processing started', jobContext)
  const staleBefore = new Date(Date.now() - config.visibilityTimeoutSeconds * 2_000).toISOString()
  let claim: Awaited<ReturnType<PersistencePort['claimJob']>>
  try {
    claim = await persistence.claimJob(job, staleBefore)
    logger.info('Supabase update completed', { ...jobContext, operation: 'claimJob', claim })
  } catch (error) {
    logger.error('Supabase job claim failed', {
      ...jobContext,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
  if (claim === 'completed') {
    logger.info('Job processing completed', {
      ...jobContext,
      result: 'already_completed',
      durationMs: Date.now() - startedAt,
    })
    return 'success'
  }
  if (claim === 'busy') {
    logger.warn('Job processing deferred for retry', {
      ...jobContext,
      result: 'busy',
      durationMs: Date.now() - startedAt,
    })
    return 'retry'
  }
  if (claim === 'missing') {
    logger.error('SQS message references a missing job', {
      ...jobContext,
      result: 'permanent_orphan',
      durationMs: Date.now() - startedAt,
    })
    return 'success'
  }

  try {
    const context = await persistence.loadIntegrationForJob(job)
    const token = decryptSecret(context.integration.encrypted_bot_token)
    const slackMessageText =
      job.slackMessageText || stringFromMetadata(context.inspection.metadata.slackMessageText)
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
    const image = context.images[0]
    if (!image || image.id !== job.imageId || image.slack_file_id !== job.slackFileId) {
      throw new PermanentSlackFileError('The queued image is no longer available')
    }
    let file: SlackFileInfo
    if (
      image.slack_file_url &&
      image.content_type &&
      VAN_DAMAGE_IMAGE_MIME_TYPES.includes(
        image.content_type as (typeof VAN_DAMAGE_IMAGE_MIME_TYPES)[number]
      )
    ) {
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
    logger.info('Slack download started', { ...jobContext, slackFileId: file.id })
    const data = await downloadSlackImage(token, file, config.maxImageBytes)
    logger.info('Slack download completed', {
      ...jobContext,
      slackFileId: file.id,
      bytes: data.length,
    })
    const imageSha256 = sha256Hex(data)
    const duplicate = await persistence.findReusableOriginal({
      tenantId: job.tenantId,
      businessId: job.businessId,
      imageId: image.id,
      sha256: imageSha256,
    })
    if (duplicate) {
      logger.info('Exact duplicate original detected', {
        ...jobContext,
        duplicateOfImageId: duplicate.imageId,
      })
      await persistence.markImageAsExactDuplicate(job, image.id, duplicate, imageSha256)
    } else {
      logger.info('S3 upload started', { ...jobContext, slackFileId: file.id })
      const uploaded = await storage.uploadOriginal({
        tenantId: job.tenantId,
        businessId: job.businessId,
        inspectionId: job.inspectionId,
        imageId: image.id,
        vehicleId: vanProfile?.id ?? null,
        slackFileId: file.id,
        fileName: file.name,
        contentType: file.mimetype,
        body: data,
        sha256: imageSha256,
      })
      logger.info('S3 upload completed', {
        ...jobContext,
        slackFileId: file.id,
        bucket: uploaded.bucket,
        key: uploaded.key,
      })
      await persistence.upsertImageS3Info(job, image.id, {
        ...uploaded,
        contentType: file.mimetype,
        size: data.length,
        width: file.width,
        height: file.height,
      })
      await persistence.upsertOriginalAsset({
        job,
        imageId: image.id,
        vanId: vanProfile?.id ?? null,
        ...uploaded,
        contentType: file.mimetype,
        size: data.length,
        width: file.width,
        height: file.height,
        sha256: imageSha256,
        source: 'slack',
      })
    }
    // Every logical image gets its own display derivatives, including exact
    // duplicates whose immutable original object is safely reused.
    try {
      const derivatives = await storage.uploadDerivatives({
        tenantId: job.tenantId,
        businessId: job.businessId,
        inspectionId: job.inspectionId,
        imageId: image.id,
        vehicleId: vanProfile?.id ?? null,
        body: data,
      })
      await persistence.upsertDerivativeAssets({
        job,
        imageId: image.id,
        vanId: vanProfile?.id ?? null,
        sourceSha256: imageSha256,
        derivatives,
      })
      logger.info('Image derivatives completed', {
        ...jobContext,
        derivativeCount: derivatives.length,
        reusedOriginal: Boolean(duplicate),
      })
    } catch (error) {
      logger.warn('Image derivative generation failed without deleting original', {
        ...jobContext,
        failureCategory: classifyFailure(error),
      })
    }
    logger.info('Supabase update completed', {
      ...jobContext,
      operation: 'upsertImageS3Info',
      imageId: image.id,
    })
    const analysisImage = { id: image.id, contentType: file.mimetype, data, role: image.image_role }
    if (!vanNumber) {
      const reason = 'Missing van number in Slack message text'
      await persistence.markInspectionNeedsReview(job, reason)
    }
    const aiRunId = await persistence.createAiRun(
      job,
      config.geminiModel,
      getDamagePromptVersion(),
      {
        imageId: job.imageId,
        slackFileId: job.slackFileId,
        slackEventId: job.slackEventId,
        slackMessageText,
        vanNumber,
      }
    )
    logger.info('Supabase update completed', { ...jobContext, operation: 'createAiRun', aiRunId })
    const cached = await persistence.findReusableDamageAnalysis({
      tenantId: job.tenantId,
      businessId: job.businessId,
      imageSha256,
      promptVersion: getDamagePromptVersion(),
      modelCapabilityVersion: 'primary_vision_v1',
    })
    if (cached) {
      await persistence.recordAiUsage({
        job,
        aiRunId,
        cacheEntryId: cached.id,
        cacheStatus: 'hit',
        inputBytes: data.length,
        inputWidth: file.width,
        inputHeight: file.height,
        estimatedCostAvoided: cached.estimatedCostAvoided,
      })
      await persistence.saveAiRawResponse(job, aiRunId, '', null)
      const cachedAnalysis = {
        ...cached.result,
        needsHumanReview: cached.result.damageRating === 3,
        warnings: [
          ...cached.result.warnings,
          'Automated result reused from a matching private evidence analysis.',
          ...(!vanNumber ? ['Vehicle identity requires review'] : []),
        ],
      }
      const aggregate = await persistence.completeImageAnalysis({
        job,
        aiRunId,
        analysis: cachedAnalysis,
      })
      logger.info('AI analysis cache hit completed', {
        ...jobContext,
        cacheEntryId: cached.id,
        aggregateStatus: aggregate.status,
      })
      return 'success'
    }
    await persistence.recordAiUsage({
      job,
      aiRunId,
      cacheStatus: 'miss',
      inputBytes: data.length,
      inputWidth: file.width,
      inputHeight: file.height,
    })
    const analysisStartedAt = Date.now()
    logger.info('AI analysis started', { ...jobContext, imageCount: 1 })
    const result = await analyze({
      config,
      images: [analysisImage],
      context: [context.inspection.title, vanNumber ? `Van ${vanNumber}` : 'Van identity pending']
        .filter(Boolean)
        .join(' - '),
    })
      .then((analysis) => {
        logger.info('AI analysis completed', {
          ...jobContext,
          durationMs: Date.now() - analysisStartedAt,
          success: true,
          needsReview: analysis.analysis.needsHumanReview,
        })
        return analysis
      })
      .catch((error) => {
        logger.error('AI analysis failed', {
          ...jobContext,
          durationMs: Date.now() - analysisStartedAt,
          success: false,
          failureCategory: classifyFailure(error),
        })
        throw error
      })
    await persistence.saveAiRawResponse(job, aiRunId, result.rawText, result.parseError)
    const analysis = {
      ...result.analysis,
      needsHumanReview: result.analysis.damageRating === 3,
      warnings: [
        ...result.analysis.warnings,
        ...(!vanNumber ? ['Vehicle identity requires review'] : []),
      ],
    }
    const cacheEntryId = await persistence.writeDamageAnalysisCache({
      job,
      imageSha256,
      promptVersion: getDamagePromptVersion(),
      modelCapabilityVersion: 'primary_vision_v1',
      analysis,
      estimatedCost: estimateDamageAnalysisCost(data.length),
    })
    await persistence.recordAiUsage({
      job,
      aiRunId,
      cacheEntryId,
      cacheStatus: 'write',
      durationMs: Date.now() - analysisStartedAt,
      inputBytes: data.length,
      inputWidth: file.width,
      inputHeight: file.height,
      estimatedCost: estimateDamageAnalysisCost(data.length),
    })
    const aggregate = await persistence.completeImageAnalysis({ job, aiRunId, analysis })
    logger.info('Supabase update completed', {
      ...jobContext,
      operation: 'completeImageAnalysis',
      aiRunId,
      aggregateStatus: aggregate.status,
    })
    logger.info('Van Damage job completed', {
      ...jobContext,
      needsReview: result.analysis.needsHumanReview,
      durationMs: Date.now() - startedAt,
    })
    return 'success'
  } catch (error) {
    if (error instanceof PermanentSlackFileError) {
      try {
        const aggregate = await persistence.markImageFailed(
          job,
          classifyFailure(error),
          publicFailureMessage(error),
          true
        )
        logger.info('Supabase update completed', {
          ...jobContext,
          operation: 'markImageFailed',
          aggregateStatus: aggregate.status,
        })
        return 'success'
      } catch (reviewError) {
        logger.error('Van Damage job failed; leaving SQS message for retry', {
          ...jobContext,
          durationMs: Date.now() - startedAt,
          failureCategory: classifyFailure(reviewError),
        })
        return 'retry'
      }
    }
    logger.error('Van Damage job failed; leaving SQS message for retry', {
      ...jobContext,
      durationMs: Date.now() - startedAt,
      failureCategory: classifyFailure(error),
    })
    const terminal = (metadata.receiveCount ?? 1) >= 3
    await persistence.markImageFailed(
      job,
      classifyFailure(error),
      publicFailureMessage(error),
      terminal
    )
    return terminal ? 'success' : 'retry'
  }
}

function estimateDamageAnalysisCost(inputBytes: number) {
  return Math.max(0.002, Math.min(0.03, (inputBytes / 1024 / 1024) * 0.003))
}

function stringFromMetadata(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function classifyFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/download|slack|access/.test(message)) return 'download_failed'
  if (/format|mime|unsupported/.test(message)) return 'unsupported_format'
  if (/timeout|timed out|abort/.test(message)) return 'provider_timeout'
  if (/rate|429/.test(message)) return 'provider_rate_limited'
  if (/parse|response|json/.test(message)) return 'invalid_response'
  return 'provider_unavailable'
}

function publicFailureMessage(error: unknown) {
  const category = classifyFailure(error)
  if (category === 'download_failed') return 'The image could not be downloaded.'
  if (category === 'unsupported_format') return 'The image format could not be analyzed.'
  if (category === 'provider_timeout') return 'Image analysis timed out.'
  if (category === 'provider_rate_limited') return 'Automated analysis is temporarily busy.'
  if (category === 'invalid_response') return 'Automated analysis returned an unusable result.'
  return 'Automated analysis is temporarily unavailable.'
}
