import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultInspectionSchedule,
  getInspectionComplianceForTenant,
  type ComplianceSubmission,
} from '../compliance'

const schedule = {
  ...defaultInspectionSchedule('America/Los_Angeles'),
  operatingDays: [1],
}
const vehicle = { id: 'van-44', label: 'Van 44', status: 'active' }
const views = ['front', 'rear', 'driver_side', 'passenger_side']

function submission(overrides: Partial<ComplianceSubmission> = {}): ComplianceSubmission {
  return {
    id: 'inspection-1',
    vanId: 'van-44',
    inspectionType: 'SOD',
    submittedAt: '2026-07-27T16:45:00.000Z',
    status: 'completed',
    reviewStatus: 'reviewed',
    images: views.map((view) => ({ view, status: 'analyzed' })),
    ...overrides,
  }
}

test('generates expected slots even when no inspection rows exist', () => {
  const result = getInspectionComplianceForTenant({
    from: '2026-07-27',
    to: '2026-07-27',
    now: new Date('2026-07-28T12:00:00.000Z'),
    schedule,
    vehicles: [vehicle],
    submissions: [],
  })
  assert.equal(result.slots.length, 2)
  assert.deepEqual(
    result.slots.map((slot) => slot.status),
    ['missing', 'missing']
  )
  assert.equal(result.metrics.required, 2)
})

test('uses deterministic on-time, late, image, failed, and duplicate rules', () => {
  const base = {
    from: '2026-07-27',
    to: '2026-07-27',
    now: new Date('2026-07-28T12:00:00.000Z'),
    schedule,
    vehicles: [vehicle],
  }
  assert.equal(
    getInspectionComplianceForTenant({ ...base, submissions: [submission()] }).slots[0].status,
    'complete'
  )
  assert.equal(
    getInspectionComplianceForTenant({
      ...base,
      submissions: [submission({ submittedAt: '2026-07-27T18:00:00.000Z' })],
    }).slots[0].status,
    'late'
  )
  assert.equal(
    getInspectionComplianceForTenant({
      ...base,
      submissions: [submission({ images: [{ view: 'front', status: 'analyzed' }] })],
    }).slots[0].status,
    'images_missing'
  )
  assert.equal(
    getInspectionComplianceForTenant({
      ...base,
      submissions: [submission({ status: 'failed' })],
    }).slots[0].status,
    'analysis_failed'
  )
  assert.equal(
    getInspectionComplianceForTenant({
      ...base,
      submissions: [submission(), submission({ id: 'inspection-2' })],
    }).slots[0].status,
    'duplicate_submission'
  )
})

test('excused slots are excluded from the compliance denominator and streak', () => {
  const result = getInspectionComplianceForTenant({
    from: '2026-07-27',
    to: '2026-07-27',
    now: new Date('2026-07-28T12:00:00.000Z'),
    schedule,
    vehicles: [vehicle],
    submissions: [],
    excuses: [{ vanId: 'van-44', slotDate: '2026-07-27', slotType: 'SOD', reason: 'Shop' }],
  })
  assert.equal(result.slots[0].status, 'excused')
  assert.equal(result.slots[0].missedStreak, 0)
  assert.equal(result.metrics.required, 1)
})

test('out-of-service vans generate no expected slots', () => {
  const result = getInspectionComplianceForTenant({
    from: '2026-07-27',
    to: '2026-07-27',
    now: new Date(),
    schedule,
    vehicles: [{ ...vehicle, status: 'out_of_service' }],
    submissions: [],
  })
  assert.equal(result.slots.length, 0)
})
