import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDamageFingerprint,
  canonicalDamageType,
  canonicalVehicleRegion,
  classifyDamageObservation,
  formatDriverName,
  orderSlackFiles,
  slackTsToIso,
} from '../history'

test('driver attribution fallback uses display, real name, username, safe Slack ID, then unknown', () => {
  assert.equal(formatDriverName({ slackWorkspaceId: 'T1', slackUserId: 'U123456', displayName: 'Jordan S.' }), 'Jordan S.')
  assert.equal(formatDriverName({ slackWorkspaceId: 'T1', slackUserId: 'U123456', realName: 'Jordan Stone' }), 'Jordan Stone')
  assert.equal(formatDriverName({ slackWorkspaceId: 'T1', slackUserId: 'U123456', username: 'jstone' }), 'jstone')
  assert.equal(formatDriverName({ slackWorkspaceId: 'T1', slackUserId: 'U123456' }), 'Slack user U12345')
  assert.equal(formatDriverName(null), 'Unknown driver')
})

test('Slack message timestamp is converted to UTC without using local server time', () => {
  assert.equal(slackTsToIso('1784677080.123456'), '2026-07-21T23:38:00.123Z')
  assert.equal(slackTsToIso('not-a-ts'), null)
})

test('Slack file ordering is stable and preserves original order when timestamps are absent', () => {
  assert.deepEqual(orderSlackFiles([{ id: 'F2' }, { id: 'F1' }]).map((file) => file.id), ['F2', 'F1'])
  assert.deepEqual(orderSlackFiles([{ id: 'F2', created: 2 }, { id: 'F1', created: 1 }]).map((file) => file.id), ['F1', 'F2'])
})

test('damage fingerprint excludes mutable severity, confidence and timestamps', () => {
  assert.equal(canonicalVehicleRegion('left rear side'), 'rear_bumper')
  assert.equal(canonicalDamageType('paint scuff'), 'scratch')
  assert.equal(
    buildDamageFingerprint({ tenantId: 'tenant', vanId: 'van', vehicleArea: 'driver_side', damageType: 'scratch' }),
    'tenant:van:driver_side:scratch',
  )
})

test('active duplicate damage is linked without creating a new alert', () => {
  const decision = classifyDamageObservation({
    tenantId: 'tenant', vanId: 'van', vehicleArea: 'driver_side', damageType: 'scratch', confidence: 0.86,
  }, [{
    id: 'case-1', tenantId: 'tenant', vanId: 'van', vehicleArea: 'driver_side',
    damageType: 'scratch', lifecycleStatus: 'active', observationCount: 1,
  }])
  assert.deepEqual(decision, {
    kind: 'existing_damage_observed',
    caseId: 'case-1',
    fingerprint: 'tenant:van:driver_side:scratch',
  })
})

test('ambiguous and repaired damage are not silently merged', () => {
  assert.equal(classifyDamageObservation({
    tenantId: 'tenant', vanId: 'van', vehicleArea: 'unknown', damageType: 'scratch', confidence: 0.9,
  }, []).kind, 'possible_duplicate')

  assert.deepEqual(classifyDamageObservation({
    tenantId: 'tenant', vanId: 'van', vehicleArea: 'rear_bumper', damageType: 'dent', confidence: 0.9,
  }, [{
    id: 'case-old', tenantId: 'tenant', vanId: 'van', vehicleArea: 'rear_bumper',
    damageType: 'dent', lifecycleStatus: 'repaired', observationCount: 3,
  }]), {
    kind: 'recurrent_damage',
    previousCaseId: 'case-old',
    fingerprint: 'tenant:van:rear_bumper:dent',
  })
})
