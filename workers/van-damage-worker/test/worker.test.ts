import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { parseDamageAnalysis } from '../src/damage-parser.js'
import { buildOriginalKey, safeFileName } from '../src/s3-storage.js'
import { processMessageBody } from '../src/process-job.js'
import type { WorkerConfig } from '../src/config.js'
import {
  buildDamageInspectionPrompt,
  getDamagePromptVersion,
} from '../src/gemini-damage-analysis.js'
import { buildClaimJobArgs, WORKER_SCHEMA_CONTRACT_VERSION } from '../src/supabase-worker.js'
import { vanDamageJobSchema } from '../../../lib/van-damage/contracts.js'
import { extractVanNumber, normalizeVanNumber } from '../src/van-number-parser.js'

test('damage parser validates the strict Gemini response', () => {
  const result = parseDamageAnalysis(
    JSON.stringify({
      summary: 'One scratch',
      overallConfidence: 0.8,
      damageRating: 2,
      damageRatingLabel: 'light_scratches',
      damageRatingReason: 'A light scratch is visible on the door.',
      damageCount: 1,
      vehicleCondition: 'good',
      items: [
        {
          imageIndex: 0,
          damageType: 'scratch',
          vehicleArea: 'door',
          severity: 'low',
          confidence: 0.8,
          description: 'Small scratch',
          repairRecommendation: 'Polish',
          estimatedCostMin: null,
          estimatedCostMax: null,
          boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        },
      ],
      needsHumanReview: false,
      warnings: [],
    })
  )
  assert.equal(result.error, null)
  assert.equal(result.data?.damageCount, 1)
  assert.equal(result.data?.damageRating, 2)
})

test('damage parser normalizes Gemini 0-1000 bounding boxes', () => {
  const result = parseDamageAnalysis(
    JSON.stringify({
      summary: 'Dent on bumper',
      overallConfidence: 0.86,
      damageRating: 3,
      damageRatingLabel: 'dents_or_damage',
      damageRatingReason: 'A dent is visible on the rear bumper.',
      damageCount: 1,
      vehicleCondition: 'fair',
      items: [
        {
          imageIndex: 0,
          damageType: 'dent',
          vehicleArea: 'rear_bumper',
          severity: 'high',
          confidence: 0.86,
          description: 'Rear bumper dent',
          repairRecommendation: 'Inspect and repair bumper',
          estimatedCostMin: null,
          estimatedCostMax: null,
          boundingBox: { x: 830, y: 720, width: 240, height: 180 },
        },
      ],
      needsHumanReview: false,
      warnings: [],
    })
  )
  assert.equal(result.error, null)
  assert.equal(result.data?.damageRating, 3)
  const box = result.data?.items[0]?.boundingBox
  assert.ok(box)
  assert.equal(box.x, 0.83)
  assert.equal(box.y, 0.72)
  assert.ok(box.width <= 0.17 + Number.EPSILON)
  assert.ok(box.height <= 0.18 + Number.EPSILON)
  assert.ok(box.x + box.width <= 1)
  assert.ok(box.y + box.height <= 1)
})

test('damage parser promotes dents to fleet level 3 and severe map styling', () => {
  const result = parseDamageAnalysis(
    JSON.stringify({
      summary: 'Panel deformation',
      overallConfidence: 0.83,
      damageRating: 1,
      damageRatingLabel: 'dirt_or_debris',
      damageRatingReason: 'Visible deformation',
      damageCount: 1,
      vehicleCondition: 'fair',
      items: [
        {
          imageIndex: 0,
          damageType: 'dent',
          vehicleArea: 'driver_rear_cargo_panel',
          severity: 'medium',
          confidence: 0.83,
          description: 'Body line bends inward on the driver rear cargo panel',
          repairRecommendation: 'Inspect and repair panel',
          estimatedCostMin: null,
          estimatedCostMax: null,
          boundingBox: { x: 0.4, y: 0.25, width: 0.18, height: 0.2 },
        },
      ],
      needsHumanReview: false,
      warnings: [],
    })
  )
  assert.equal(result.error, null)
  assert.equal(result.data?.damageRating, 3)
  assert.equal(result.data?.damageRatingLabel, 'dents_or_damage')
  assert.equal(result.data?.items[0]?.severity, 'high')
  assert.equal(result.data?.items[0]?.vehicleArea, 'driver_rear_cargo_panel')
  assert.equal(result.data?.needsHumanReview, true)
})

test('damage parser corrects an opposite-side location from the source image role', () => {
  const result = parseDamageAnalysis(
    JSON.stringify({
      summary: 'Passenger door dent',
      overallConfidence: 0.83,
      damageRating: 3,
      damageRatingLabel: 'dents_or_damage',
      damageRatingReason: 'Visible door deformation',
      damageCount: 1,
      vehicleCondition: 'fair',
      items: [
        {
          imageIndex: 0,
          damageType: 'dent',
          vehicleArea: 'driver_front_door',
          severity: 'high',
          confidence: 0.83,
          description: 'Door deformation',
          repairRecommendation: 'Inspect and repair panel',
          estimatedCostMin: null,
          estimatedCostMax: null,
          boundingBox: { x: 0.4, y: 0.25, width: 0.18, height: 0.2 },
        },
      ],
      needsHumanReview: false,
      warnings: [],
    }),
    ['passenger_side']
  )
  assert.equal(result.error, null)
  assert.equal(result.data?.items[0]?.vehicleArea, 'passenger_front_door')
  assert.equal(result.data?.needsHumanReview, true)
  assert.match(result.data?.warnings[0] ?? '', /source image role/)
})

test('only Level 3 damage requires human review', () => {
  const result = parseDamageAnalysis(
    JSON.stringify({
      summary: 'Uncertain light scratch',
      overallConfidence: 0.55,
      damageRating: 2,
      damageRatingLabel: 'light_scratches',
      damageRatingReason: 'A possible surface scratch is visible.',
      damageCount: 1,
      vehicleCondition: 'good',
      items: [
        {
          imageIndex: 0,
          damageType: 'scratch',
          vehicleArea: 'driver_front_door',
          severity: 'low',
          confidence: 0.55,
          description: 'Possible light scratch',
          repairRecommendation: 'Monitor during routine checks',
          estimatedCostMin: null,
          estimatedCostMax: null,
          boundingBox: null,
        },
      ],
      needsHumanReview: true,
      warnings: ['Low confidence'],
    })
  )
  assert.equal(result.data?.damageRating, 2)
  assert.equal(result.data?.needsHumanReview, false)
})

test('inspection prompt requires dent evidence and precise Transit regions', () => {
  const prompt = buildDamageInspectionPrompt('Van 44')
  assert.match(prompt, /highlights\/reflections that bend consistently/)
  assert.match(prompt, /Do not call ordinary reflections, shadows, dirt/)
  assert.match(prompt, /driver_rear_cargo_panel/)
  assert.match(prompt, /role is authoritative/)
  assert.match(prompt, /tight bounding box around the defect itself/)
  assert.equal(getDamagePromptVersion(), 'van-damage-v3')
})

test('S3 original keys are deterministic and sanitize filenames', () => {
  assert.equal(safeFileName('../../bad name?.jpg'), 'bad-name-.jpg')
  const key = buildOriginalKey({
    tenantId: 'tenant',
    businessId: 'business',
    inspectionId: 'inspection',
    slackFileId: 'F1',
    fileName: 'van photo.jpg',
  })
  assert.equal(
    key,
    'tenants/tenant/van-damage/business/inspections/inspection/original/F1-van-photo.jpg'
  )
  const lifecycleKey = buildOriginalKey({
    tenantId: 'tenant 1',
    businessId: 'tenant 1',
    inspectionId: 'inspection/1',
    imageId: 'image/1',
    vehicleId: '../van 44',
    slackFileId: 'F1',
    fileName: '../../van photo?.jpg',
    contentType: 'image/jpeg',
  })
  assert.equal(
    lifecycleKey,
    'tenants/tenant-1/vehicles/van-44/inspections/inspection-1/images/image-1/original/F1-van-photo-.jpg'
  )
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
    ['64 has a coolant leak', '64'],
    ['12 needs an oil change', '12'],
    ['72 PSI reported', null],
    ['uploaded 6 photos', null],
  ]
  for (const [text, expected] of examples) {
    assert.equal(extractVanNumber(text), expected, text)
  }
})

test('van number normalization treats prefixed and bare values as one van', () => {
  const examples: Array<[string, string | null]> = [
    ['44', '44'],
    ['van 44', '44'],
    ['Van #44', '44'],
    ['vehicle number 44', '44'],
    ['truck no. 44', '44'],
    ['unit num 44', '44'],
  ]
  for (const [value, expected] of examples) {
    assert.equal(normalizeVanNumber(value), expected, value)
  }
})

test('completed duplicate and permanently orphaned jobs are successful no-ops', async () => {
  const tenantId = randomUUID()
  const body = JSON.stringify({
    version: 'v1',
    jobType: 'van_damage_slack_inspection',
    jobId: randomUUID(),
    tenantId,
    businessId: tenantId,
    integrationId: randomUUID(),
    inspectionId: randomUUID(),
    slackTeamId: 'T1',
    slackChannelId: 'C1',
    slackMessageTs: '1.0001',
    slackThreadTs: null,
    slackEventId: 'Ev1',
    slackMessageText: 'van #64',
    imageId: randomUUID(),
    slackFileId: 'F1',
    slackFileIds: ['F1'],
    analysisVersion: 'van-damage-v2',
    createdAt: new Date().toISOString(),
  })
  const config = {
    nodeEnv: 'test',
    awsRegion: 'us-east-2',
    queueUrl: 'https://example.com/queue',
    bucket: 'bucket',
    supabaseUrl: 'https://example.supabase.co',
    supabaseServiceRoleKey: 'service-role-key-that-is-long',
    geminiApiKey: 'gemini-key',
    geminiModel: 'gemini-2.5-flash',
    encryptionKey: '12345678901234567890123456789012',
    concurrency: 3,
    visibilityTimeoutSeconds: 300,
    maxImageBytes: 20_000_000,
    maxGeminiRawBytes: 12_000_000,
    logLevel: 'info',
  } satisfies WorkerConfig
  const unused = async () => {
    throw new Error('should not be called')
  }
  for (const claim of ['completed', 'missing'] as const) {
    const persistence = {
      claimJob: async () => claim,
      loadIntegrationForJob: unused,
      findReusableOriginal: unused,
      markImageAsExactDuplicate: unused,
      upsertOriginalAsset: unused,
      upsertDerivativeAssets: unused,
      findReusableDamageAnalysis: unused,
      writeDamageAnalysisCache: unused,
      recordAiUsage: unused,
      upsertImageS3Info: unused,
      createAiRun: unused,
      saveAiRawResponse: unused,
      completeImageAnalysis: unused,
      markImageFailed: unused,
      getOrCreateVanByNumber: unused,
      attachInspectionToVan: unused,
      markInspectionNeedsReview: unused,
      updateVanProfileAfterInspection: unused,
    }
    const result = await processMessageBody(body, {
      config,
      persistence,
      storage: { uploadOriginal: unused, uploadDerivatives: unused },
    })
    assert.equal(result, 'success', claim)
  }
})

test('Supabase job claims include the full tenant/business/inspection scope', () => {
  const tenantId = randomUUID()
  const job = vanDamageJobSchema.parse({
    version: 'v1',
    jobType: 'van_damage_slack_inspection',
    jobId: randomUUID(),
    tenantId,
    businessId: tenantId,
    integrationId: randomUUID(),
    inspectionId: randomUUID(),
    slackTeamId: 'T1',
    slackChannelId: 'C1',
    slackMessageTs: '1.0001',
    slackThreadTs: null,
    slackEventId: 'Ev1',
    slackMessageText: '64',
    imageId: randomUUID(),
    slackFileId: 'F1',
    slackFileIds: ['F1'],
    analysisVersion: 'van-damage-v2',
    createdAt: new Date().toISOString(),
  })
  assert.deepEqual(buildClaimJobArgs(job, '2026-07-04T00:00:00.000Z'), {
    p_job_id: job.jobId,
    p_tenant_id: tenantId,
    p_business_id: tenantId,
    p_inspection_id: job.inspectionId,
    p_image_id: job.imageId,
    p_stale_before: '2026-07-04T00:00:00.000Z',
  })
  assert.equal(WORKER_SCHEMA_CONTRACT_VERSION, '2026-07-29-v1')
})

test('invalid messages remain available for SQS redrive', async () => {
  assert.equal(await processMessageBody('{bad-json'), 'retry')
})
