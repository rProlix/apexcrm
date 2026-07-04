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

export class SupabaseWorker {
  private db: SupabaseClient
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

  async markInspectionAnalyzing(job: VanDamageJobV1, model: string) {
    const { error } = await this.db.from('van_damage_inspections').update({ status: 'analyzing', ai_model: model })
      .eq('id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId)
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
      damageType: item.damageType,
      vehicleArea: item.vehicleArea,
      severity: item.severity,
      confidence: item.confidence,
      description: item.description,
      repairRecommendation: item.repairRecommendation,
      estimatedCostMin: item.estimatedCostMin,
      estimatedCostMax: item.estimatedCostMax,
      boundingBox: item.boundingBox,
      metadata: { imageIndex: item.imageIndex },
    }))
    const { error } = await this.db.rpc('complete_van_damage_job', {
      p_job_id: input.job.jobId,
      p_inspection_id: input.job.inspectionId,
      p_ai_run_id: input.aiRunId,
      p_analysis: input.analysis as unknown as Json,
      p_items: items as unknown as Json,
      p_needs_review: input.analysis.needsHumanReview || Boolean(input.analysis.warnings.length),
    })
    if (error) throw new Error(error.message)
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
