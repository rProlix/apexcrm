import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_INSPECTION_TIME_ZONE,
  formatInspectionTimestamp,
  getInspectionLocalDateKey,
  getInspectionPeriod,
  resolveInspectionTimeZone,
} from '../inspection-period'

test('inspection period classifies SOD boundary times in tenant timezone', () => {
  assert.equal(getInspectionPeriod('2026-07-18T14:00:00.000Z', 'America/Los_Angeles').period, 'SOD')
  assert.equal(getInspectionPeriod('2026-07-18T15:30:00.000Z', 'America/Los_Angeles').period, 'SOD')
  assert.equal(getInspectionPeriod('2026-07-18T18:00:00.000Z', 'America/Los_Angeles').period, 'SOD')
})

test('inspection period classifies EOD boundary times in tenant timezone', () => {
  assert.equal(getInspectionPeriod('2026-07-18T18:01:00.000Z', 'America/Los_Angeles').period, 'EOD')
  assert.equal(getInspectionPeriod('2026-07-18T21:45:00.000Z', 'America/Los_Angeles').period, 'EOD')
  assert.equal(getInspectionPeriod('2026-07-19T04:59:00.000Z', 'America/Los_Angeles').period, 'EOD')
  assert.equal(getInspectionPeriod('2026-07-19T05:00:00.000Z', 'America/Los_Angeles').period, 'EOD')
})

test('inspection period returns unknown only for missing or invalid timestamps', () => {
  assert.equal(getInspectionPeriod(null, 'America/Los_Angeles').period, 'UNKNOWN')
  assert.equal(getInspectionPeriod('', 'America/Los_Angeles').period, 'UNKNOWN')
  assert.equal(getInspectionPeriod('not-a-date', 'America/Los_Angeles').period, 'UNKNOWN')
})

test('inspection period uses the supplied timezone instead of browser or server local time', () => {
  const timestamp = '2026-07-18T17:30:00.000Z'
  assert.equal(getInspectionPeriod(timestamp, 'America/Los_Angeles').period, 'SOD')
  assert.equal(getInspectionPeriod(timestamp, 'America/New_York').period, 'EOD')
})

test('inspection period handles DST transition instants', () => {
  assert.equal(getInspectionPeriod('2026-03-08T11:30:00.000Z', 'America/New_York').period, 'SOD')
  assert.equal(getInspectionPeriod('2026-11-01T18:30:00.000Z', 'America/New_York').period, 'EOD')
})

test('legacy inspections classify from existing created_at timestamps', () => {
  const legacyInspection = { created_at: '2024-02-10T16:20:00.000Z' }
  assert.equal(getInspectionPeriod(legacyInspection.created_at, 'America/Los_Angeles').period, 'SOD')
})

test('tenant timezone resolver prefers tenant branding and falls back safely', () => {
  assert.equal(resolveInspectionTimeZone({ tenant: { branding: { timezone: 'America/Chicago' } } }), 'America/Chicago')
  assert.equal(resolveInspectionTimeZone({ tenant: { branding: { timezone: 'Not/AZone' } } }), DEFAULT_INSPECTION_TIME_ZONE)
})

test('inspection date helpers format with timezone-aware local dates', () => {
  assert.equal(getInspectionLocalDateKey('2026-07-19T04:30:00.000Z', 'America/Los_Angeles'), '2026-07-18')
  assert.match(formatInspectionTimestamp('2026-07-18T14:00:00.000Z', { timeZone: 'America/Los_Angeles' }), /7:00 AM/)
})
