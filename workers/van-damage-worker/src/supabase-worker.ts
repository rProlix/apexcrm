import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../../../lib/supabase/types.js'
import type { VanDamageJobV1, GeminiDamageAnalysis } from '../../../lib/van-damage/contracts.js'
import type { EncryptedSecret } from '../../../lib/server/crypto/encrypt-token.js'
import type { WorkerConfig } from './config.js'

export const WORKER_SCHEMA_CONTRACT_VERSION = '2026-07-04-v1'

export function buildClaimJobArgs(job: VanDamageJobV1, staleBefore: string) {
  return {
    p_job_id: job.jobId,
    p_tenant_id: job.tenantId,
    p_business_id: job.businessId,
    p_inspection_id: job.inspectionId,
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
  metadata: Record<string, unknown>
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

  async claimJob(job: VanDamageJobV1, staleBefore: string): Promise<'claimed' | 'completed' | 'busy' | 'missing'> {
    const { data, error } = await this.db.rpc('claim_van_damage_job', {
      ...buildClaimJobArgs(job, staleBefore),
    })
    if (error) throw new Error(error.message)
    return data as 'claimed' | 'completed' | 'busy' | 'missing'
  }

  async loadIntegrationForJob(job: VanDamageJobV1): Promise<WorkerJobContext> {
    const [integrationResult, inspectionResult, imagesResult] = await Promise.all([
      this.db.from('van_slack_integrations').select('id, encrypted_bot_token')
        .eq('id', job.integrationId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId)
        .eq('slack_team_id', job.slackTeamId).eq('status', 'connected').is('deleted_at', null).single(),
      this.db.from('van_damage_inspections').select('id, title, metadata')
        .eq('id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId).single(),
      this.db.from('van_damage_images').select('id, slack_file_id, slack_file_url, content_type, file_size_bytes, width, height, image_role, metadata')
        .eq('inspection_id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId),
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
    const { data: existing, error: existingError } = await this.db.from('vehicles')
      .select('id, tenant_id, name, van_number, status, metadata')
      .eq('tenant_id', input.tenantId)
      .eq('van_number', input.vanNumber)
      .limit(1)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (existing) return existing as WorkerVanProfile

    const insert: Record<string, unknown> = {
      tenant_id: input.tenantId,
      name: `Van ${input.vanNumber}`,
      van_number: input.vanNumber,
      status: 'active',
      metadata: {
        source: 'slack_auto_created',
        businessId: input.businessId,
        vanNumber: input.vanNumber,
      },
    }
    if (await this.hasVehicleColumn('business_id')) insert.business_id = input.businessId

    const { data: created, error: createError } = await this.db.from('vehicles').insert(insert).select('id, tenant_id, name, van_number, status, metadata').single()
    if (!createError && created) return created as WorkerVanProfile

    const { data: afterRace, error: afterRaceError } = await this.db.from('vehicles')
      .select('id, tenant_id, name, van_number, status, metadata')
      .eq('tenant_id', input.tenantId)
      .eq('van_number', input.vanNumber)
      .limit(1)
      .maybeSingle()
    if (afterRaceError) throw new Error(afterRaceError.message)
    if (afterRace) return afterRace as WorkerVanProfile
    throw new Error(createError?.message ?? 'Unable to create van profile')
  }

  async attachInspectionToVan(job: VanDamageJobV1, van: WorkerVanProfile, vanNumber: string) {
    const { data: current, error: currentError } = await this.db.from('van_damage_inspections')
      .select('metadata')
      .eq('id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
      .single()
    if (currentError) throw new Error(currentError.message)
    const metadata = {
      ...((current?.metadata ?? {}) as Record<string, unknown>),
      vanNumber,
      vanId: van.id,
      vanNumberSource: 'slack_message_text',
    }
    const { error } = await this.db.from('van_damage_inspections').update({
      van_id: van.id,
      metadata,
    }).eq('id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async markInspectionAnalyzing(job: VanDamageJobV1, model: string) {
    const { error } = await this.db.from('van_damage_inspections').update({ status: 'analyzing', ai_model: model })
      .eq('id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async markInspectionNeedsReview(job: VanDamageJobV1, reason: string) {
    const { data: current, error: currentError } = await this.db.from('van_damage_inspections')
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
    const { error } = await this.db.from('van_damage_inspections').update({
      status: 'needs_review',
      error_message: reason.slice(0, 2_000),
      metadata,
    }).eq('id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async upsertImageS3Info(job: VanDamageJobV1, imageId: string, values: {
    bucket: string; key: string; etag: string | null; contentType: string
    size: number; width: number | null; height: number | null
  }) {
    const { error } = await this.db.from('van_damage_images').update({
      s3_bucket: values.bucket, s3_key: values.key, s3_etag: values.etag,
      content_type: values.contentType, file_size_bytes: values.size,
      width: values.width, height: values.height, status: 'uploaded',
    }).eq('id', imageId).eq('inspection_id', job.inspectionId)
      .eq('tenant_id', job.tenantId).eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async createAiRun(job: VanDamageJobV1, model: string, promptVersion: string, inputSummary: Json) {
    const { data, error } = await this.db.from('van_damage_ai_runs').insert({
      tenant_id: job.tenantId, business_id: job.businessId, inspection_id: job.inspectionId,
      provider: 'gemini', model, status: 'started', prompt_version: promptVersion, input_summary: inputSummary,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  async saveAiRawResponse(job: VanDamageJobV1, aiRunId: string, rawText: string, parseError: string | null) {
    const { error } = await this.db.from('van_damage_ai_runs').update({
      raw_response: { text: rawText }, error_message: parseError,
    }).eq('id', aiRunId)
      .eq('inspection_id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId)
    if (error) throw new Error(error.message)
  }

  async replaceDamageItemsAndComplete(input: {
    job: VanDamageJobV1; aiRunId: string; analysis: GeminiDamageAnalysis
    imageIds: string[]
  }) {
    const items = input.analysis.items.map((item) => ({
      imageId: input.imageIds[item.imageIndex] ?? null,
      damageType: item.damageType === 'dirt_debris' ? 'unknown' : item.damageType,
      vehicleArea: item.vehicleArea,
      severity: item.severity,
      confidence: item.confidence,
      description: item.description,
      repairRecommendation: item.repairRecommendation,
      estimatedCostMin: item.estimatedCostMin,
      estimatedCostMax: item.estimatedCostMax,
      boundingBox: item.boundingBox,
      metadata: { imageIndex: item.imageIndex, originalDamageType: item.damageType },
    }))
    const { error } = await this.db.rpc('complete_van_damage_job', {
      p_job_id: input.job.jobId,
      p_inspection_id: input.job.inspectionId,
      p_ai_run_id: input.aiRunId,
      p_analysis: input.analysis as unknown as Json,
      p_items: items as unknown as Json,
      p_needs_review: input.analysis.needsHumanReview,
    })
    if (error) throw new Error(error.message)
  }

  async updateVanProfileAfterInspection(input: {
    tenantId: string
    vanId: string
    inspectionId: string
    summary: string
    damageCount: number
    imageCount: number
  }) {
    const { data: van, error: vanError } = await this.db.from('vehicles')
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

    const { error } = await this.db.from('vehicles').update(update)
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

  async markJobFailed(job: VanDamageJobV1, errorMessage: string) {
    const message = errorMessage.slice(0, 2_000)
    await Promise.all([
      this.db.from('van_damage_jobs').update({ status: 'failed', last_error: message }).eq('id', job.jobId)
        .eq('tenant_id', job.tenantId).eq('business_id', job.businessId),
      this.db.from('van_damage_inspections').update({ status: 'failed', error_message: message }).eq('id', job.inspectionId)
        .eq('tenant_id', job.tenantId).eq('business_id', job.businessId),
    ])
  }

  async checkSchemaCompatibility() {
    const { data: contract, error: contractError } = await this.db.rpc('van_damage_worker_schema_contract')
    if (contractError) throw new Error(`Worker schema contract unavailable: ${contractError.message}`)
    if (!contract || contract.version !== WORKER_SCHEMA_CONTRACT_VERSION) {
      throw new Error(`Unsupported worker schema contract: ${String(contract?.version ?? 'missing')}`)
    }

    const probes = [
      this.db.from('van_slack_integrations').select('id, tenant_id, business_id, slack_team_id, encrypted_bot_token, status, deleted_at', { head: true }).limit(1),
      this.db.from('van_damage_jobs').select('id, tenant_id, business_id, inspection_id, status, attempt_count, updated_at', { head: true }).limit(1),
      this.db.from('van_damage_inspections').select('id, tenant_id, business_id, title, status, ai_model, error_message', { head: true }).limit(1),
      this.db.from('van_damage_images').select('id, tenant_id, business_id, inspection_id, slack_file_id, slack_file_url, content_type, status', { head: true }).limit(1),
      this.db.from('van_damage_ai_runs').select('id, tenant_id, business_id, inspection_id, status, raw_response', { head: true }).limit(1),
      this.db.from('van_damage_items').select('id, tenant_id, business_id, inspection_id, image_id', { head: true }).limit(1),
    ]
    const results = await Promise.all(probes)
    const failed = results.find((result) => result.error)
    if (failed?.error) throw new Error(`Worker table contract mismatch: ${failed.error.message}`)
    return contract as { version: string }
  }
}
