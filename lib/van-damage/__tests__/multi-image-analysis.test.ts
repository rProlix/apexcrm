import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { aggregateImageAnalyses } from '../image-analysis-aggregate'

test('1, 6, and 12 successful image analyses aggregate without losing findings', () => {
  for (const total of [1, 6, 12]) {
    const aggregate = aggregateImageAnalyses(
      Array.from({ length: total }, (_, index) => ({
        status: 'completed' as const,
        confidence: 0.6 + index / 100,
        damageCount: 1,
      }))
    )
    assert.equal(aggregate.status, 'complete')
    assert.equal(aggregate.completed, total)
    assert.equal(aggregate.damageCount, total)
  }
})

test('partial failures preserve successful results and exclude failed confidence', () => {
  const aggregate = aggregateImageAnalyses([
    ...Array.from({ length: 5 }, () => ({
      status: 'completed' as const,
      confidence: 0.8,
      damageCount: 1,
    })),
    { status: 'failed', confidence: null, damageCount: 99 } as const,
  ])
  assert.equal(aggregate.status, 'complete_with_warnings')
  assert.equal(aggregate.completed, 5)
  assert.equal(aggregate.failed, 1)
  assert.equal(aggregate.damageCount, 5)
  assert.equal(aggregate.confidence, 0.8)
})

test('all invalid images have nullable confidence instead of synthetic zero', () => {
  const aggregate = aggregateImageAnalyses([
    { status: 'failed', confidence: null },
    { status: 'skipped', confidence: null },
  ])
  assert.equal(aggregate.confidence, null)
  assert.equal(aggregate.status, 'failed')
})

test('mixed pending and complete images remain partially complete', () => {
  const aggregate = aggregateImageAnalyses([
    { status: 'completed', confidence: 0.9, damageCount: 0 },
    { status: 'processing', confidence: null },
    { status: 'queued', confidence: null },
  ])
  assert.equal(aggregate.status, 'partially_complete')
  assert.equal(aggregate.confidence, 0.9)
  assert.equal(aggregate.damageCount, 0)
})

test('migration enforces image-scoped idempotency and does not delete sibling findings', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260728100000_multi_image_analysis_pipeline.sql'),
    'utf8'
  )
  const correction = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260729010000_fix_multi_image_job_idempotency.sql'),
    'utf8'
  )
  for (const sql of [migration, correction]) {
    assert.match(sql, /tenant_id::text \|\| ':' \|\| image_row\.id::text \|\| ':'/)
    assert.doesNotMatch(sql, /tenant_id::text \|\| ':' \|\| i\.id::text \|\| ':'/)
  }
  assert.match(correction, /a\.status IN \('completed','needs_review'\)/)
  assert.match(correction, /ON CONFLICT \(tenant_id,image_id,analysis_version\) DO UPDATE/)
  assert.match(migration, /DELETE FROM public\.van_damage_items[\s\S]*image_id = p_image_id/)
  assert.doesNotMatch(
    migration,
    /DELETE FROM public\.van_damage_items\s+WHERE tenant_id = p_tenant_id AND inspection_id = p_inspection_id;/
  )
  assert.match(migration, /pg_advisory_xact_lock/)
})

test('recovery persists queued image state before sending and reuses durable job identity', () => {
  const recovery = readFileSync(
    resolve(process.cwd(), 'scripts/repair-multi-image-inspections.ts'),
    'utf8'
  )
  const durableLookup = recovery.indexOf(".eq('idempotency_key', idempotencyKey)")
  const queuedAnalysis = recovery.indexOf(".from('van_damage_image_analyses').upsert")
  const queueSend = recovery.indexOf('sendVanDamageJob(payload)')
  assert.ok(durableLookup > 0)
  assert.ok(queuedAnalysis > durableLookup)
  assert.ok(queueSend > queuedAnalysis)
  assert.match(recovery, /jobId: durableJob\.id/)
})
