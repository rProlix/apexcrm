import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { parseDamageAnalysis } from '../src/damage-parser.js'
import { buildOriginalKey, safeFileName } from '../src/s3-storage.js'
import { processMessageBody } from '../src/process-job.js'
import type { WorkerConfig } from '../src/config.js'
import { buildClaimJobArgs, WORKER_SCHEMA_CONTRACT_VERSION } from '../src/supabase-worker.js'
import { vanDamageJobSchema } from '../../../lib/van-damage/contracts.js'
import { extractVanNumber } from '../src/van-number-parser.js'

test('damage parser validates the strict Gemini response', () => {
  const result = parseDamageAnalysis(JSON.stringify({
    summary: 'One scratch', overallConfidence: 0.8, damageCount: 1, vehicleCondition: 'good',
    items: [{ imageIndex: 0, damageType: 'scratch', vehicleArea: 'door', severity: 'low', confidence: 0.8,
      description: 'Small scratch', repairRecommendation: 'Polish', estimatedCostMin: null,
      estimatedCostMax: null, boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
    needsHumanReview: false, warnings: [],
  }))
  assert.equal(result.error, null)
  assert.equal(result.data?.damageCount, 1)
})

test('S3 original keys are deterministic and sanitize filenames', () => {
  assert.equal(safeFileName('../../bad name?.jpg'), 'bad-name-.jpg')
  const key = buildOriginalKey({ tenantId: 'tenant', businessId: 'business', inspectionId: 'inspection', slackFileId: 'F1', fileName: 'van photo.jpg' })
  assert.equal(key, 'tenants/tenant/van-damage/business/inspections/inspection/original/F1-van-photo.jpg')
})

test('van number parser resolves explicit, hashtag, and number-only Slack text', () => {
  const examples: Array<[string, string | null]> = [
    ['van #64', '64'],
    ['van 64', '64'],
    ['Van #64', '64'],
    ['vehicle #64', '64'],
    ['truck 64', '64'],
    ['unit 64', '64'],
    ['#64', '64'],
    ['64', '64'],
    ['van number 064', '064'],
    ['damage on van #64 rear bumper', '64'],
    ['uploaded 6 photos', null],
  ]
  for (const [text, expected] of examples) {
    assert.equal(extractVanNumber(text), expected, text)
  }
})

test('completed duplicate jobs are successful no-ops', async () => {
  const tenantId = randomUUID()
  const body = JSON.stringify({
    version: 'v1', jobType: 'van_damage_slack_inspection', jobId: randomUUID(), tenantId, businessId: tenantId,
    integrationId: randomUUID(), inspectionId: randomUUID(), slackTeamId: 'T1', slackChannelId: 'C1',
    slackMessageTs: '1.0001', slackThreadTs: null, slackEventId: 'Ev1', slackMessageText: 'van #64',
    slackFileIds: ['F1'], createdAt: new Date().toISOString(),
  })
  const config = {
    nodeEnv: 'test', awsRegion: 'us-east-2', queueUrl: 'https://example.com/queue', bucket: 'bucket',
    supabaseUrl: 'https://example.supabase.co', supabaseServiceRoleKey: 'service-role-key-that-is-long',
    geminiApiKey: 'gemini-key', geminiModel: 'gemini-2.5-flash', encryptionKey: '12345678901234567890123456789012',
    concurrency: 3, visibilityTimeoutSeconds: 300, maxImageBytes: 20_000_000, maxGeminiRawBytes: 12_000_000, logLevel: 'info',
  } satisfies WorkerConfig
  const unused = async () => { throw new Error('should not be called') }
  const persistence = {
    claimJob: async () => 'completed' as const,
    loadIntegrationForJob: unused,
    markInspectionAnalyzing: unused,
    upsertImageS3Info: unused,
    createAiRun: unused,
    saveAiRawResponse: unused,
    replaceDamageItemsAndComplete: unused,
    markJobFailed: unused,
    getOrCreateVanByNumber: unused,
    attachInspectionToVan: unused,
    markInspectionNeedsReview: unused,
    updateVanProfileAfterInspection: unused,
  }
  const result = await processMessageBody(body, { config, persistence, storage: { uploadOriginal: unused } })
  assert.equal(result, 'success')
})

test('Supabase job claims include the full tenant/business/inspection scope', () => {
  const tenantId = randomUUID()
  const job = vanDamageJobSchema.parse({
    version: 'v1', jobType: 'van_damage_slack_inspection', jobId: randomUUID(), tenantId, businessId: tenantId,
    integrationId: randomUUID(), inspectionId: randomUUID(), slackTeamId: 'T1', slackChannelId: 'C1',
    slackMessageTs: '1.0001', slackThreadTs: null, slackEventId: 'Ev1', slackMessageText: '64',
    slackFileIds: ['F1'], createdAt: new Date().toISOString(),
  })
  assert.deepEqual(buildClaimJobArgs(job, '2026-07-04T00:00:00.000Z'), {
    p_job_id: job.jobId,
    p_tenant_id: tenantId,
    p_business_id: tenantId,
    p_inspection_id: job.inspectionId,
    p_stale_before: '2026-07-04T00:00:00.000Z',
  })
  assert.equal(WORKER_SCHEMA_CONTRACT_VERSION, '2026-07-04-v1')
})

test('invalid messages remain available for SQS redrive', async () => {
  assert.equal(await processMessageBody('{bad-json'), 'retry')
})
