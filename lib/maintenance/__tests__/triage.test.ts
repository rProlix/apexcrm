import test from 'node:test'
import assert from 'node:assert/strict'
import { compareMaintenancePriority, triageMaintenanceReport } from '../triage'

test('maintenance triage separates safety urgency, quick fixes, and appointment work', () => {
  const brakes = triageMaintenanceReport('Van 64 brake failure')
  assert.equal(brakes.effectivePriority, 'urgent')
  assert.equal(brakes.operationalImpact, 'out_of_service')
  const pressure = triageMaintenanceReport('64 has low tire pressure')
  assert.equal(pressure.effectivePriority, 'high')
  assert.equal(pressure.resolutionEffort, 'quick_fix')
  const oil = triageMaintenanceReport('Van 12 needs an oil change')
  assert.equal(oil.schedulingDependency, 'shop_appointment')
  assert.equal(oil.effectivePriority, 'normal')
  assert.equal(triageMaintenanceReport('Van 7 makes a strange noise').needsReview, true)
})

test('priority ordering puts critical and out-of-service work before convenience work', () => {
  const base = {
    reportedAt: '2026-07-23T10:00:00Z',
    latestActivityAt: '2026-07-23T10:00:00Z',
    dueAt: null,
    scheduledAt: null,
  }
  const critical = {
    ...base,
    effectivePriority: 'urgent' as const,
    severity: 'critical' as const,
    operationalImpact: 'out_of_service' as const,
    timeSensitivity: 'immediate' as const,
    resolutionEffort: 'diagnostic_required' as const,
  }
  const quick = {
    ...base,
    effectivePriority: 'low' as const,
    severity: 'low' as const,
    operationalImpact: 'operational' as const,
    timeSensitivity: 'same_day' as const,
    resolutionEffort: 'quick_fix' as const,
  }
  assert.ok(compareMaintenancePriority(critical, quick) < 0)
})
