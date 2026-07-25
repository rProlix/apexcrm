import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateUniqueSevereVans,
  effectiveDamageSeverity,
  normalizeDamageSeverity,
  type FleetAttentionCandidate,
} from '../severity'
import { buildFleetDamageCards, compareFleetDamageCards } from '../fleet-damage'

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

test('Fleet damage cards resolve current level, analysis state and tenant isolation', () => {
  const cards = buildFleetDamageCards({
    tenantId: 'tenant-1',
    vehicles: [
      vehicle('van-1', '64'),
      vehicle('van-2', '65'),
      vehicle('van-3', '66'),
    ],
    damageCases: [
      damageCase({ van_id: 'van-1', current_severity: 'level_2' }),
      damageCase({ van_id: 'van-1', current_severity: 'level_3', needs_review: true }),
      damageCase({ van_id: 'van-2', current_severity: 'level_3', lifecycle_status: 'repaired' }),
      damageCase({ tenant_id: 'tenant-2', business_id: 'tenant-2', van_id: 'van-3', current_severity: 'level_3' }),
    ],
    analyses: [
      analysis({ van_id: 'van-1', run_completed_at: '2026-07-24T10:00:00.000Z' }),
      analysis({ van_id: 'van-2', run_status: 'processing' }),
      analysis({ tenant_id: 'tenant-2', van_id: 'van-3', run_completed_at: '2026-07-24T11:00:00.000Z' }),
    ],
  })

  assert.equal(cards.find((card) => card.id === 'van-1')?.damageLevel, 3)
  assert.equal(cards.find((card) => card.id === 'van-1')?.level3Count, 1)
  assert.equal(cards.find((card) => card.id === 'van-1')?.needsReview, true)
  assert.equal(cards.find((card) => card.id === 'van-1')?.analysisState, 'completed')
  assert.equal(cards.find((card) => card.id === 'van-2')?.damageLevel, 0)
  assert.equal(cards.find((card) => card.id === 'van-2')?.analysisState, 'processing')
  assert.equal(cards.find((card) => card.id === 'van-3')?.damageLevel, 0)
  assert.equal(cards.find((card) => card.id === 'van-3')?.analysisState, 'never')
})

test('Fleet damage sorting is deterministic for severity and van number', () => {
  const cards = buildFleetDamageCards({
    tenantId: 'tenant-1',
    vehicles: [vehicle('van-1', '10'), vehicle('van-2', '2')],
    damageCases: [
      damageCase({ van_id: 'van-1', current_severity: 'level_1' }),
      damageCase({ van_id: 'van-2', current_severity: 'level_3' }),
    ],
    analyses: [],
  })

  assert.deepEqual([...cards].sort((a, b) => compareFleetDamageCards(a, b, 'highest_damage')).map((card) => card.van_number), ['2', '10'])
  assert.deepEqual([...cards].sort((a, b) => compareFleetDamageCards(a, b, 'van_asc')).map((card) => card.van_number), ['2', '10'])
  assert.deepEqual([...cards].sort((a, b) => compareFleetDamageCards(a, b, 'van_desc')).map((card) => card.van_number), ['10', '2'])
})

function vehicle(id: string, vanNumber: string) {
  return {
    id,
    van_number: vanNumber,
    name: `Van ${vanNumber}`,
    make: 'Ford',
    model: 'Transit',
    year: 2019,
    plate_number: null,
    status: 'active',
    profileImageId: null,
  }
}

function damageCase(overrides: Partial<Parameters<typeof buildFleetDamageCards>[0]['damageCases'][number]>) {
  return {
    tenant_id: 'tenant-1',
    business_id: 'tenant-1',
    van_id: 'van-1',
    lifecycle_status: 'active',
    current_severity: 'level_1',
    max_observed_severity: null,
    effective_severity: null,
    needs_review: false,
    last_observed_at: '2026-07-24T09:00:00.000Z',
    latest_observed_inspection_id: 'inspection-1',
    latest_evidence_image_id: 'image-1',
    ...overrides,
  }
}

function analysis(overrides: Partial<Parameters<typeof buildFleetDamageCards>[0]['analyses'][number]>) {
  return {
    tenant_id: 'tenant-1',
    van_id: 'van-1',
    inspection_id: 'inspection-1',
    inspection_status: 'completed',
    completed_at: null,
    created_at: '2026-07-24T08:00:00.000Z',
    run_status: 'completed',
    run_completed_at: null,
    ...overrides,
  }
}
