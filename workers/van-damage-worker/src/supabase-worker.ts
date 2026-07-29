import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../../../lib/supabase/types.js'
import type { VanDamageJobV1, GeminiDamageAnalysis } from '../../../lib/van-damage/contracts.js'
import type { EncryptedSecret } from '../../../lib/server/crypto/encrypt-token.js'
import type { WorkerConfig } from './config.js'
import { normalizeVanNumber } from './van-number-parser.js'
import {
  DAMAGE_ANALYSIS_TASK_VERSION,
  DERIVATIVE_RENDER_VERSION,
  IMAGE_LIFECYCLE_POLICY_VERSION,
  IMAGE_PREPROCESSING_VERSION,
  buildAiCacheKey,
  resolveImageRetentionPolicy,
  type ImageDerivativeProfile,
} from '../../../lib/van-damage/image-lifecycle.js'

export const WORKER_SCHEMA_CONTRACT_VERSION = '2026-07-29-v1'

export function buildClaimJobArgs(job: VanDamageJobV1, staleBefore: string) {
  return {
    p_job_id: job.jobId,
    p_tenant_id: job.tenantId,
    p_business_id: job.businessId,
    p_inspection_id: job.inspectionId,
    p_image_id: job.imageId,
    p_stale_before: staleBefore,
  }
}

export type WorkerImageRow = {
  id: string
  slack_file_id: string | null
  slack_file_url: string | null
  content_type: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  image_role: string | null
  upload_order?: number | null
  original_file_index?: number | null
  metadata: Record<string, unknown>
}

export type ReusableImageAsset = {
  imageId: string
  bucket: string
  key: string
  contentType: string
  size: number
  width: number | null
  height: number | null
}

export type CachedDamageAnalysis = {
  id: string
  result: GeminiDamageAnalysis
  estimatedCostAvoided: number
}

export type WorkerJobContext = {
  integration: { id: string; encrypted_bot_token: EncryptedSecret }
  inspection: { id: string; title: string | null; metadata: Record<string, unknown> }
  images: WorkerImageRow[]
}

export type WorkerVanProfile = {
  id: string
  tenant_id: string
  name: string
  van_number: string | null
  status: string
  metadata: Record<string, unknown>
}

export class SupabaseWorker {
  private db: SupabaseClient
  private vehicleColumnCache = new Map<string, boolean>()

  constructor(config: WorkerConfig) {
    this.db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async claimJob(
    job: VanDamageJobV1,
    staleBefore: string
  ): Promise<'claimed' | 'completed' | 'busy' | 'missing'> {
    const { data, error } = await this.db.rpc('claim_van_damage_image_job', {
      ...buildClaimJobArgs(job, staleBefore),
    })
    if (error) throw new Error(error.message)
    return data as 'claimed' | 'completed' | 'busy' | 'missing'
  }

  async loadIntegrationForJob(job: VanDamageJobV1): Promise<WorkerJobContext> {
    const [integrationResult, inspectionResult, imagesResult] = await Promise.all([
      this.db
        .from('van_slack_integrations')
        .select('id, encrypted_bot_token')
        .eq('id', job.integrationId)
        .eq('tenant_id', job.tenantId)
        .eq('business_id', job.businessId)
        .eq('slack_team_id', job.slackTeamId)
        .eq('status', 'connected')
        .is('deleted_at', null)
        .single(),
      this.db
        .from('van_damage_inspections')
        .select('id, title, metadata')
        .eq('id', job.inspectionId)
        .eq('tenant_id', job.tenantId)
        .eq('business_id', job.businessId)
        .single(),
      this.db
        .from('van_damage_images')
        .select(
          'id, slack_file_id, slack_file_url, content_type, file_size_bytes, width, height, image_role, upload_order, original_file_index, metadata'
        )
        .eq('id', job.imageId)
        .eq('inspection_id', job.inspectionId)
        .eq('tenant_id', job.tenantId)
        .eq('business_id', job.businessId)
        .order('upload_order', { ascending: true, nullsFirst: false })
        .order('original_file_index', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
    ])
    if (integrationResult.error) throw new Error(integrationResult.error.message)
    if (inspectionResult.error) throw new Error(inspectionResult.error.message)
    if (imagesResult.error) throw new Error(imagesResult.error.message)
    return {
      integration: integrationResult.data as WorkerJobContext['integration'],
      inspection: inspectionResult.data as WorkerJobContext['inspection'],
      images: (imagesResult.data ?? []) as WorkerImageRow[],
    }
  }

  async getOrCreateVanByNumber(input: {
    tenantId: string
    businessId: string
    vanNumber: string
  }): Promise<WorkerVanProfile> {
    const canonicalVanNumber = normalizeVanNumber(input.vanNumber)
    if (!canonicalVanNumber) throw new Error('A valid van number is required')
    const { data: existing, error: existingError } = await this.db
      .from('vehicles')
      .select('id, tenant_id, name, van_number, status, metadata')
      .eq('tenant_id', input.tenantId)
      .eq('van_number', canonicalVanNumber)
      .limit(1)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (existing) return existing as WorkerVanProfile

    const { data: candidates, error: candidateError } = await this.db
      .from('vehicles')
      .select('id, tenant_id, name, van_number, status, metadata')
      .eq('tenant_id', input.tenantId)
      .not('van_number', 'is', null)
      .limit(1000)
    if (candidateError) throw new Error(candidateError.message)
    const canonicalMatches = ((candidates ?? []) as WorkerVanProfile[]).filter(
      (candidate) => normalizeVanNumber(candidate.van_number) === canonicalVanNumber
    )
    if (canonicalMatches.length === 1) return canonicalMatches[0]
    if (canonicalMatches.length > 1) {
      throw new Error(`Multiple van profiles match canonical van number ${canonicalVanNumber}`)
    }

    const insert: Record<string, unknown> = {
      tenant_id: input.tenantId,
      name: `Van ${canonicalVanNumber}`,
      van_number: canonicalVanNumber,
      status: 'active',
      metadata: {
        source: 'slack_auto_created',
        businessId: input.businessId,
        vanNumber: canonicalVanNumber,
        rawVanNumber: input.vanNumber,
      },
    }
    if (await this.hasVehicleColumn('business_id')) insert.business_id = input.businessId

    const { data: created, error: createError } = await this.db
      .from('vehicles')
      .insert(insert)
      .select('id, tenant_id, name, van_number, status, metadata')
      .single()
    if (!createError && created) return created as WorkerVanProfile

    const { data: afterRace, error: afterRaceError } = await this.db
      .from('vehicles')
      .select('id, tenant_id, name, van_number, status, metadata')
      .eq('tenant_id', input.tenantId)
      .eq('van_number', canonicalVanNumber)
      .limit(1)
      .maybeSingle()
    if (afterRaceError) throw new Error(afterRaceError.message)
    if (afterRace) return afterRace as WorkerVanProfile
    throw new Error(createError?.message ?? 'Unable to create van profile')
  }

  async attachInspectionToVan(job: VanDamageJobV1, van: WorkerVanProfile, vanNumber: string) {
    const canonicalVanNumber = normalizeVanNumber(vanNumber) ?? vanNumber
    const { data: current, error: currentError } = await this.db
      .from('van_damage_inspections')
      .select('metadata')
      .eq('id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
      .single()
    if (currentError) throw new Error(currentError.message)
    const metadata = {
      ...((current?.metadata ?? {}) as Record<string, unknown>),
      vanNumber: canonicalVanNumber,
      rawVanNumber: vanNumber,
      vanId: van.id,
      vanNumberSource: 'slack_message_text',
    }
    const { error } = await this.db
      .from('van_damage_inspections')
      .update({
        van_id: van.id,
        metadata,
      })
      .eq('id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async markInspectionNeedsReview(job: VanDamageJobV1, reason: string) {
    const { data: current, error: currentError } = await this.db
      .from('van_damage_inspections')
      .select('metadata')
      .eq('id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
      .single()
    if (currentError) throw new Error(currentError.message)
    const metadata = {
      ...((current?.metadata ?? {}) as Record<string, unknown>),
      reviewReason: reason,
      missingVanNumber: true,
    }
    const { error } = await this.db
      .from('van_damage_inspections')
      .update({
        status: 'needs_review',
        error_message: reason.slice(0, 2_000),
        metadata,
      })
      .eq('id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async upsertImageS3Info(
    job: VanDamageJobV1,
    imageId: string,
    values: {
      bucket: string
      key: string
      etag: string | null
      contentType: string
      size: number
      width: number | null
      height: number | null
    }
  ) {
    const { error } = await this.db
      .from('van_damage_images')
      .update({
        s3_bucket: values.bucket,
        s3_key: values.key,
        s3_etag: values.etag,
        content_type: values.contentType,
        file_size_bytes: values.size,
        width: values.width,
        height: values.height,
        status: 'uploaded',
      })
      .eq('id', imageId)
      .eq('inspection_id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async findReusableOriginal(input: {
    tenantId: string
    businessId: string
    imageId: string
    sha256: string
  }): Promise<ReusableImageAsset | null> {
    const { data, error } = await this.db
      .from('van_damage_image_assets')
      .select('image_id,bucket,object_key,content_type,byte_size,width,height')
      .eq('tenant_id', input.tenantId)
      .eq('business_id', input.businessId)
      .eq('asset_type', 'original')
      .eq('sha256', input.sha256)
      .neq('image_id', input.imageId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
      imageId: String(data.image_id),
      bucket: String(data.bucket),
      key: String(data.object_key),
      contentType: String(data.content_type),
      size: Number(data.byte_size),
      width: typeof data.width === 'number' ? data.width : null,
      height: typeof data.height === 'number' ? data.height : null,
    }
  }

  async markImageAsExactDuplicate(
    job: VanDamageJobV1,
    imageId: string,
    duplicate: ReusableImageAsset,
    sha256: string
  ) {
    const retention = resolveImageRetentionPolicy({
      assetType: 'original',
      uploadedAt: new Date(),
    })
    const { error } = await this.db
      .from('van_damage_images')
      .update({
        s3_bucket: duplicate.bucket,
        s3_key: duplicate.key,
        content_type: duplicate.contentType,
        file_size_bytes: duplicate.size,
        width: duplicate.width,
        height: duplicate.height,
        status: 'uploaded',
        original_sha256: sha256,
        duplicate_of_image_id: duplicate.imageId,
        duplicate_status: 'reused_original',
        duplicate_confidence: 1,
        retention_until: retention.retainUntil,
        deletion_eligible_at: retention.deletionEligibleAt,
        lifecycle_state: retention.lifecycleState,
      })
      .eq('id', imageId)
      .eq('inspection_id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
    await this.recordStorageUsage({
      tenantId: job.tenantId,
      businessId: job.businessId,
      inspectionId: job.inspectionId,
      imageId,
      eventType: 'duplicate_reused',
      assetType: 'original',
      byteDelta: 0,
      objectCountDelta: 0,
      metadata: { duplicateOfImageId: duplicate.imageId },
    })
  }

  async upsertOriginalAsset(input: {
    job: VanDamageJobV1
    imageId: string
    vanId?: string | null
    bucket: string
    key: string
    contentType: string
    size: number
    width: number | null
    height: number | null
    sha256: string
    source: 'slack' | 'worker'
  }) {
    const retention = resolveImageRetentionPolicy({
      assetType: 'original',
      uploadedAt: new Date(),
    })
    const { data, error } = await this.db
      .from('van_damage_image_assets')
      .upsert(
        {
          tenant_id: input.job.tenantId,
          business_id: input.job.businessId,
          inspection_id: input.job.inspectionId,
          image_id: input.imageId,
          vehicle_id: input.vanId ?? null,
          asset_type: 'original',
          derivative_profile: 'original',
          derivative_version: 'original',
          storage_provider: 's3',
          bucket: input.bucket,
          object_key: input.key,
          content_type: input.contentType,
          byte_size: input.size,
          width: input.width,
          height: input.height,
          sha256: input.sha256,
          source_sha256: input.sha256,
          source: input.source,
          status: 'active',
          retention_until: retention.retainUntil,
          deletion_eligible_at: retention.deletionEligibleAt,
          lifecycle_policy_version: retention.policyVersion,
          metadata: { retentionReason: retention.reason },
        },
        { onConflict: 'tenant_id,image_id,asset_type,derivative_profile,derivative_version' }
      )
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    await this.recordStorageUsage({
      tenantId: input.job.tenantId,
      businessId: input.job.businessId,
      inspectionId: input.job.inspectionId,
      imageId: input.imageId,
      assetId: String(data.id),
      eventType: 'upload',
      assetType: 'original',
      byteDelta: input.size,
      objectCountDelta: 1,
      metadata: { sha256: input.sha256 },
    })
  }

  async upsertDerivativeAssets(input: {
    job: VanDamageJobV1
    imageId: string
    vanId?: string | null
    sourceSha256: string
    derivatives: Array<{
      profile: ImageDerivativeProfile
      bucket: string
      key: string
      contentType: string
      size: number
      width: number | null
      height: number | null
      quality: number
      version: string
    }>
  }) {
    for (const derivative of input.derivatives) {
      const retention = resolveImageRetentionPolicy({
        assetType: derivative.profile,
        uploadedAt: new Date(),
      })
      const { data, error } = await this.db
        .from('van_damage_image_assets')
        .upsert(
          {
            tenant_id: input.job.tenantId,
            business_id: input.job.businessId,
            inspection_id: input.job.inspectionId,
            image_id: input.imageId,
            vehicle_id: input.vanId ?? null,
            asset_type: derivative.profile,
            derivative_profile: derivative.profile,
            derivative_version: derivative.version,
            storage_provider: 's3',
            bucket: derivative.bucket,
            object_key: derivative.key,
            content_type: derivative.contentType,
            byte_size: derivative.size,
            width: derivative.width,
            height: derivative.height,
            source_sha256: input.sourceSha256,
            source: 'worker',
            status: 'active',
            cache_control: 'private, max-age=31536000, immutable',
            retention_until: retention.retainUntil,
            deletion_eligible_at: retention.deletionEligibleAt,
            lifecycle_policy_version: retention.policyVersion,
            metadata: {
              quality: derivative.quality,
              rendererVersion: DERIVATIVE_RENDER_VERSION,
              retentionReason: retention.reason,
            },
          },
          { onConflict: 'tenant_id,image_id,asset_type,derivative_profile,derivative_version' }
        )
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      await this.recordStorageUsage({
        tenantId: input.job.tenantId,
        businessId: input.job.businessId,
        inspectionId: input.job.inspectionId,
        imageId: input.imageId,
        assetId: String(data.id),
        eventType: 'derivative_created',
        assetType: derivative.profile,
        byteDelta: derivative.size,
        objectCountDelta: 1,
        metadata: { quality: derivative.quality, sourceSha256: input.sourceSha256 },
      })
    }
  }

  async findReusableDamageAnalysis(input: {
    tenantId: string
    businessId: string
    imageSha256: string
    promptVersion: string
    modelCapabilityVersion: string
  }): Promise<CachedDamageAnalysis | null> {
    const cacheKey = buildAiCacheKey({
      tenantId: input.tenantId,
      imageSha256: input.imageSha256,
      taskType: 'damage_detection',
      taskVersion: DAMAGE_ANALYSIS_TASK_VERSION,
      promptVersion: input.promptVersion,
      modelCapabilityVersion: input.modelCapabilityVersion,
      preprocessingVersion: IMAGE_PREPROCESSING_VERSION,
      configurationVersion: IMAGE_LIFECYCLE_POLICY_VERSION,
    })
    const { data, error } = await this.db
      .from('van_damage_ai_cache_entries')
      .select('id,result,estimated_cost_avoided,status,hit_count')
      .eq('tenant_id', input.tenantId)
      .eq('business_id', input.businessId)
      .eq('cache_key', cacheKey)
      .in('status', ['completed', 'needs_review'])
      .is('human_invalidated_at', null)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    await this.db
      .from('van_damage_ai_cache_entries')
      .update({
        hit_count: Number((data as { hit_count?: number }).hit_count ?? 0) + 1,
        last_hit_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('tenant_id', input.tenantId)
    return {
      id: String(data.id),
      result: data.result as unknown as GeminiDamageAnalysis,
      estimatedCostAvoided: Number(data.estimated_cost_avoided ?? 0),
    }
  }

  async writeDamageAnalysisCache(input: {
    job: VanDamageJobV1
    imageSha256: string
    promptVersion: string
    modelCapabilityVersion: string
    analysis: GeminiDamageAnalysis
    estimatedCost: number
  }) {
    const cacheKey = buildAiCacheKey({
      tenantId: input.job.tenantId,
      imageSha256: input.imageSha256,
      taskType: 'damage_detection',
      taskVersion: DAMAGE_ANALYSIS_TASK_VERSION,
      promptVersion: input.promptVersion,
      modelCapabilityVersion: input.modelCapabilityVersion,
      preprocessingVersion: IMAGE_PREPROCESSING_VERSION,
      configurationVersion: IMAGE_LIFECYCLE_POLICY_VERSION,
    })
    const { data, error } = await this.db
      .from('van_damage_ai_cache_entries')
      .upsert(
        {
          tenant_id: input.job.tenantId,
          business_id: input.job.businessId,
          cache_key: cacheKey,
          image_sha256: input.imageSha256,
          task_type: 'damage_detection',
          task_version: DAMAGE_ANALYSIS_TASK_VERSION,
          prompt_version: input.promptVersion,
          model_capability_version: input.modelCapabilityVersion,
          preprocessing_version: IMAGE_PREPROCESSING_VERSION,
          configuration_version: IMAGE_LIFECYCLE_POLICY_VERSION,
          status: input.analysis.needsHumanReview ? 'needs_review' : 'completed',
          result_schema_version: 'van-damage-result-v1',
          result: input.analysis as unknown as Json,
          summary: input.analysis.summary,
          confidence: input.analysis.overallConfidence,
          estimated_cost: input.estimatedCost,
          estimated_cost_avoided: input.estimatedCost,
        },
        { onConflict: 'tenant_id,cache_key' }
      )
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return String(data.id)
  }

  async recordAiUsage(input: {
    job: VanDamageJobV1
    aiRunId?: string | null
    cacheEntryId?: string | null
    cacheStatus: 'hit' | 'miss' | 'bypass' | 'write' | 'skip'
    durationMs?: number | null
    inputBytes?: number | null
    inputWidth?: number | null
    inputHeight?: number | null
    estimatedCost?: number
    estimatedCostAvoided?: number
    skipReason?: string | null
    failureCategory?: string | null
  }) {
    const { error } = await this.db.from('ai_usage_events').insert({
      tenant_id: input.job.tenantId,
      business_id: input.job.businessId,
      inspection_id: input.job.inspectionId,
      image_id: input.job.imageId,
      ai_run_id: input.aiRunId ?? null,
      cache_entry_id: input.cacheEntryId ?? null,
      task_type: 'damage_detection',
      task_version: DAMAGE_ANALYSIS_TASK_VERSION,
      provider_capability: 'primary_vision',
      cache_status: input.cacheStatus,
      skip_reason: input.skipReason ?? null,
      request_count: input.cacheStatus === 'miss' ? 1 : 0,
      retry_count: 0,
      duration_ms: input.durationMs ?? null,
      input_width: input.inputWidth ?? null,
      input_height: input.inputHeight ?? null,
      input_bytes: input.inputBytes ?? null,
      estimated_cost: input.estimatedCost ?? 0,
      estimated_cost_avoided: input.estimatedCostAvoided ?? 0,
      failure_category: input.failureCategory ?? null,
    })
    if (error) throw new Error(error.message)
  }

  private async recordStorageUsage(input: {
    tenantId: string
    businessId: string
    inspectionId: string
    imageId: string
    assetId?: string | null
    eventType: 'upload' | 'derivative_created' | 'duplicate_reused'
    assetType: 'original' | 'thumbnail' | 'medium' | 'large'
    byteDelta: number
    objectCountDelta: number
    metadata?: Record<string, unknown>
  }) {
    const { error } = await this.db.from('storage_usage_events').insert({
      tenant_id: input.tenantId,
      business_id: input.businessId,
      inspection_id: input.inspectionId,
      image_id: input.imageId,
      asset_id: input.assetId ?? null,
      event_type: input.eventType,
      asset_type: input.assetType,
      storage_provider: 's3',
      storage_class: 'STANDARD',
      byte_delta: input.byteDelta,
      object_count_delta: input.objectCountDelta,
      metadata: (input.metadata ?? {}) as Json,
    })
    if (error) throw new Error(error.message)
  }

  async createAiRun(job: VanDamageJobV1, model: string, promptVersion: string, inputSummary: Json) {
    const { data, error } = await this.db
      .from('van_damage_ai_runs')
      .insert({
        tenant_id: job.tenantId,
        business_id: job.businessId,
        inspection_id: job.inspectionId,
        image_id: job.imageId,
        provider: 'gemini',
        model,
        status: 'started',
        prompt_version: promptVersion,
        input_summary: inputSummary,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  async saveAiRawResponse(
    job: VanDamageJobV1,
    aiRunId: string,
    rawText: string,
    parseError: string | null
  ) {
    const { error } = await this.db
      .from('van_damage_ai_runs')
      .update({
        raw_response: { text: rawText },
        error_message: parseError,
      })
      .eq('id', aiRunId)
      .eq('inspection_id', job.inspectionId)
      .eq('image_id', job.imageId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async completeImageAnalysis(input: {
    job: VanDamageJobV1
    aiRunId: string
    analysis: GeminiDamageAnalysis
  }) {
    const items = input.analysis.items.map((item) => ({
      damageType: item.damageType === 'dirt_debris' ? 'unknown' : item.damageType,
      vehicleArea: item.vehicleArea,
      severity: item.severity,
      confidence: item.confidence,
      description: item.description,
      repairRecommendation: item.repairRecommendation,
      estimatedCostMin: item.estimatedCostMin,
      estimatedCostMax: item.estimatedCostMax,
      boundingBox: item.boundingBox,
      metadata: {
        providerImageIndex: item.imageIndex,
        originalDamageType: item.damageType,
        sourceImageId: input.job.imageId,
      },
    }))
    const { data, error } = await this.db.rpc('complete_van_damage_image_job', {
      p_job_id: input.job.jobId,
      p_tenant_id: input.job.tenantId,
      p_inspection_id: input.job.inspectionId,
      p_image_id: input.job.imageId,
      p_ai_run_id: input.aiRunId,
      p_analysis: input.analysis as unknown as Json,
      p_items: items as unknown as Json,
      p_needs_review: input.analysis.needsHumanReview,
    })
    if (error) throw new Error(error.message)
    return data as Record<string, unknown>
  }

  async updateVanProfileAfterInspection(input: {
    tenantId: string
    vanId: string
    inspectionId: string
    summary: string
    damageCount: number
    imageCount: number
  }) {
    const { data: van, error: vanError } = await this.db
      .from('vehicles')
      .select('metadata')
      .eq('id', input.vanId)
      .eq('tenant_id', input.tenantId)
      .single()
    if (vanError) throw new Error(vanError.message)

    const currentDamageStatus = input.damageCount > 0 ? 'damage_detected' : 'no_damage_detected'
    const metadata = {
      ...((van?.metadata ?? {}) as Record<string, unknown>),
      vanDamage: {
        latestInspectionId: input.inspectionId,
        latestInspectionAt: new Date().toISOString(),
        latestDamageSummary: input.summary,
        damageCount: input.damageCount,
        imageCount: input.imageCount,
        currentDamageStatus,
      },
    }
    const update: Record<string, unknown> = { metadata }
    const optionalColumns: Record<string, unknown> = {
      latest_inspection_id: input.inspectionId,
      latest_inspection_at: metadata.vanDamage.latestInspectionAt,
      latest_damage_summary: input.summary,
      damage_summary: input.summary,
      current_damage_status: currentDamageStatus,
      damage_status: currentDamageStatus,
      latest_image_count: input.imageCount,
      image_count: input.imageCount,
    }

    for (const [column, value] of Object.entries(optionalColumns)) {
      if (await this.hasVehicleColumn(column)) update[column] = value
    }

    const { error } = await this.db
      .from('vehicles')
      .update(update)
      .eq('id', input.vanId)
      .eq('tenant_id', input.tenantId)
    if (error) throw new Error(error.message)
  }

  private async hasVehicleColumn(column: string): Promise<boolean> {
    const cached = this.vehicleColumnCache.get(column)
    if (cached != null) return cached

    const { error } = await this.db.from('vehicles').select(column, { head: true }).limit(1)
    const exists = !error
    this.vehicleColumnCache.set(column, exists)
    return exists
  }

  async markImageFailed(
    job: VanDamageJobV1,
    category: string,
    errorMessage: string,
    terminal: boolean
  ) {
    const { data, error } = await this.db.rpc('fail_van_damage_image_job', {
      p_job_id: job.jobId,
      p_tenant_id: job.tenantId,
      p_inspection_id: job.inspectionId,
      p_image_id: job.imageId,
      p_failure_category: category,
      p_failure_message: errorMessage.slice(0, 500),
      p_terminal: terminal,
    })
    if (error) throw new Error(error.message)
    return data as Record<string, unknown>
  }

  async checkSchemaCompatibility() {
    const { data: contract, error: contractError } = await this.db.rpc(
      'van_damage_worker_schema_contract'
    )
    if (contractError)
      throw new Error(`Worker schema contract unavailable: ${contractError.message}`)
    if (!contract || contract.version !== WORKER_SCHEMA_CONTRACT_VERSION) {
      throw new Error(
        `Unsupported worker schema contract: ${String(contract?.version ?? 'missing')}`
      )
    }

    const probes = [
      this.db
        .from('van_slack_integrations')
        .select(
          'id, tenant_id, business_id, slack_team_id, encrypted_bot_token, status, deleted_at',
          { head: true }
        )
        .limit(1),
      this.db
        .from('van_damage_jobs')
        .select(
          'id, tenant_id, business_id, inspection_id, image_id, status, attempt_count, updated_at',
          { head: true }
        )
        .limit(1),
      this.db
        .from('van_damage_inspections')
        .select('id, tenant_id, business_id, title, status, ai_model, error_message', {
          head: true,
        })
        .limit(1),
      this.db
        .from('van_damage_images')
        .select(
          'id, tenant_id, business_id, inspection_id, slack_file_id, slack_file_url, content_type, status',
          { head: true }
        )
        .limit(1),
      this.db
        .from('van_damage_image_analyses')
        .select('id, tenant_id, business_id, inspection_id, image_id, status, valid_confidence', {
          head: true,
        })
        .limit(1),
      this.db
        .from('van_damage_ai_runs')
        .select('id, tenant_id, business_id, inspection_id, status, raw_response', { head: true })
        .limit(1),
      this.db
        .from('van_damage_items')
        .select('id, tenant_id, business_id, inspection_id, image_id', { head: true })
        .limit(1),
      this.db
        .from('van_damage_image_assets')
        .select('id, tenant_id, business_id, image_id, asset_type, object_key, sha256', {
          head: true,
        })
        .limit(1),
      this.db
        .from('van_damage_ai_cache_entries')
        .select('id, tenant_id, business_id, cache_key, image_sha256, task_type', { head: true })
        .limit(1),
      this.db
        .from('storage_usage_events')
        .select('id, tenant_id, event_type, byte_delta', { head: true })
        .limit(1),
      this.db
        .from('ai_usage_events')
        .select('id, tenant_id, task_type, cache_status', { head: true })
        .limit(1),
    ]
    const results = await Promise.all(probes)
    const failed = results.find((result) => result.error)
    if (failed?.error) throw new Error(`Worker table contract mismatch: ${failed.error.message}`)
    return contract as { version: string }
  }
}
