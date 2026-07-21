import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateUniqueSevereVans,
  effectiveDamageSeverity,
  normalizeDamageSeverity,
  type FleetAttentionCandidate,
} from '../severity'

test('Level 3 severity normalization accepts numeric, string, and severe representations', () => {
  for (const value of [
    3,
    '3',
    'level_3',
    'level 3',
    'level3',
    'severe',
    'high',
    'dents_or_damage',
  ]) {
    assert.equal(normalizeDamageSeverity(value).severe, true, String(value))
    assert.equal(normalizeDamageSeverity(value).level, 3, String(value))
  }
  assert.equal(normalizeDamageSeverity('critical').level, 4)
  assert.equal(normalizeDamageSeverity('critical').severe, true)
  assert.equal(normalizeDamageSeverity('level_5').severe, true)
  assert.equal(normalizeDamageSeverity(2).severe, false)
  assert.equal(normalizeDamageSeverity('unknown').recognized, false)
  assert.equal(normalizeDamageSeverity('unknown').severe, false)
})

test('a valid human severity override wins over AI severity in both directions', () => {
  assert.equal(
    effectiveDamageSeverity({ effectiveSeverity: 'level_3', currentSeverity: 'low' }).severe,
    true
  )
  assert.equal(
    effectiveDamageSeverity({ effectiveSeverity: 'level_2', currentSeverity: 'critical' }).severe,
    false
  )
  assert.equal(
    effectiveDamageSeverity({ effectiveSeverity: 'unknown', currentSeverity: 'high' }).severe,
    true
  )
})

function candidate(overrides: Partial<FleetAttentionCandidate> = {}): FleetAttentionCandidate {
  return {
    tenantId: 'tenant-1',
    vanId: 'van-1',
    lifecycleStatus: 'active',
    currentSeverity: 'high',
    inspectionId: 'inspection-1',
    imageId: 'image-1',
    observedAt: '2026-07-21T10:00:00.000Z',
    ...overrides,
  }
}

test('multiple severe findings, cases, inspections, images, and alerts still aggregate to one van', () => {
  const result = aggregateUniqueSevereVans([
    candidate(),
    candidate({
      inspectionId: 'inspection-2',
      imageId: 'image-2',
      observedAt: '2026-07-21T11:00:00.000Z',
    }),
    candidate({
      currentSeverity: 'critical',
      inspectionId: 'inspection-3',
      imageId: 'image-3',
      observedAt: '2026-07-21T12:00:00.000Z',
    }),
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].severeSourceCount, 3)
  assert.equal(result[0].highestSeverityLevel, 4)
  assert.equal(result[0].latestInspectionId, 'inspection-3')
  assert.equal(result[0].latestImageId, 'image-3')
})

test('tenant and van ID form the unique key, not van number or evidence identifiers', () => {
  const result = aggregateUniqueSevereVans([
    candidate(),
    candidate({ tenantId: 'tenant-2' }),
    candidate({ vanId: 'van-2' }),
  ])
  assert.equal(result.length, 3)
})

test('resolved, repaired, dismissed, archived, and Level 2-only cases do not qualify', () => {
  const result = aggregateUniqueSevereVans([
    candidate({ lifecycleStatus: 'resolved' }),
    candidate({ lifecycleStatus: 'repaired' }),
    candidate({ lifecycleStatus: 'dismissed' }),
    candidate({ lifecycleStatus: 'archived' }),
    candidate({ currentSeverity: 'medium' }),
  ])
  assert.deepEqual(result, [])
})

test('repair states remain qualifying and recurrence returns the van to attention', () => {
  const result = aggregateUniqueSevereVans([
    candidate({ lifecycleStatus: 'repair_scheduled' }),
    candidate({ lifecycleStatus: 'in_repair' }),
    candidate({ lifecycleStatus: 'recurrent', vanId: 'van-2' }),
  ])
  assert.equal(result.length, 2)
  assert.equal(result.find((item) => item.vanId === 'van-1')?.severeSourceCount, 2)
})
