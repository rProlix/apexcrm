import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  DAMAGE_ANALYSIS_TASK_VERSION,
  DERIVATIVE_PROFILES,
  IMAGE_LIFECYCLE_POLICY_VERSION,
  assertTenantScopedObjectKey,
  buildAiCacheKey,
  buildVanDamageObjectKey,
  resolveImageRetentionPolicy,
  sha256Hex,
} from '../image-lifecycle'

test('van damage object keys are deterministic, tenant scoped, and sanitized', () => {
  const key = buildVanDamageObjectKey({
    tenantId: 'tenant 1',
    vehicleId: '../van 44',
    inspectionId: 'inspection/1',
    imageId: 'image/1',
    assetType: 'original',
    fileName: '../../van photo?.jpeg',
    contentType: 'image/jpeg',
  })
  assert.equal(
    key,
    'tenants/tenant-1/vehicles/van-44/inspections/inspection-1/images/image-1/original/van-photo-.jpg'
  )
  assert.doesNotThrow(() => assertTenantScopedObjectKey(key, 'tenant 1'))
  assert.throws(() => assertTenantScopedObjectKey(key, 'other tenant'), /outside the tenant scope/)
})

test('derivative profiles map to immutable webp object keys', () => {
  for (const profile of Object.keys(DERIVATIVE_PROFILES) as Array<
    keyof typeof DERIVATIVE_PROFILES
  >) {
    const key = buildVanDamageObjectKey({
      tenantId: 'tenant-1',
      vehicleId: 'van-44',
      inspectionId: 'inspection-1',
      imageId: 'image-1',
      assetType: profile,
    })
    assert.match(key, new RegExp(`/derivatives/${profile}-derivative-render-v1\\.webp$`))
  }
})

test('AI cache keys isolate tenant, image hash, prompt, task, model capability, and policy version', () => {
  const base = {
    tenantId: 'tenant-1',
    imageSha256: sha256Hex('same private evidence'),
    taskType: 'damage_detection' as const,
    taskVersion: DAMAGE_ANALYSIS_TASK_VERSION,
    promptVersion: 'van-damage-v3',
    modelCapabilityVersion: 'primary_vision_v1',
  }
  const original = buildAiCacheKey(base)
  assert.equal(buildAiCacheKey(base), original)
  assert.notEqual(buildAiCacheKey({ ...base, tenantId: 'tenant-2' }), original)
  assert.notEqual(buildAiCacheKey({ ...base, promptVersion: 'van-damage-v4' }), original)
  assert.notEqual(
    buildAiCacheKey({ ...base, modelCapabilityVersion: 'primary_vision_v2' }),
    original
  )
  assert.notEqual(
    buildAiCacheKey({ ...base, configurationVersion: 'image-lifecycle-v2' }),
    original
  )
})

test('retention resolver blocks deletion while legal hold is active', () => {
  const resolution = resolveImageRetentionPolicy({
    assetType: 'original',
    uploadedAt: '2026-07-29T00:00:00.000Z',
    legalHold: true,
  })
  assert.equal(resolution.policyVersion, IMAGE_LIFECYCLE_POLICY_VERSION)
  assert.equal(resolution.lifecycleState, 'delete_blocked')
  assert.equal(resolution.retainUntil, null)
  assert.equal(resolution.deletionEligibleAt, null)
})

test('database contract defines lifecycle tables, owner summary RPC, and RLS', async () => {
  const migration = await readFile(
    new URL(
      '../../../supabase/migrations/20260729120000_image_lifecycle_cache_cost_controls.sql',
      import.meta.url
    ),
    'utf8'
  )
  for (const table of [
    'van_damage_image_assets',
    'van_damage_ai_cache_entries',
    'storage_usage_events',
    'ai_usage_events',
    'retention_policies',
    'legal_holds',
    'storage_lifecycle_events',
    'archive_restore_requests',
    'deletion_jobs',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`))
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_owner_image_operations_summary/)
  assert.doesNotMatch(migration, /public\s*:=\s*true/i)
})
