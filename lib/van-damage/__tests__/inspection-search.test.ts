import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  defaultInspectionSearchFilters,
  filterAndSortInspections,
  type InspectionSearchRow,
} from '../inspection-search'

const base: InspectionSearchRow = {
  id: 'inspection-1', title: 'Morning check', status: 'completed', reviewStatus: 'pending',
  imageCount: 2, damageCount: 1, aiSummary: 'Light scratch near door', aiConfidence: .9,
  createdAt: '2026-07-20T15:00:00.000Z', updatedAt: '2026-07-20T15:05:00.000Z', reviewedAt: null,
  uploadAt: '2026-07-20T15:00:00.000Z', latestDamageAt: '2026-07-20T15:04:00.000Z', firstDamageAt: '2026-07-20T15:04:00.000Z',
  driverName: 'Jordan Stone', driverId: 'driver-1', vanName: 'Transit 12', vanNumber: '12', vanId: 'van-12', inspectionNumber: 'INS-001',
  damageTypes: ['scratch'], regions: ['driver_side'], severities: ['low'], observationTypes: ['new_damage'], repairStatuses: ['active'], notes: ['check door'], activeDamageCount: 1, latestImageId: 'image-1',
}

const severe: InspectionSearchRow = {
  ...base, id: 'inspection-2', title: 'Evening return', driverName: 'Morgan Lee', driverId: 'driver-2', vanName: 'Transit 77', vanNumber: '77', vanId: 'van-77', inspectionNumber: 'INS-002',
  imageCount: 5, damageCount: 3, aiSummary: 'Dent on rear bumper', damageTypes: ['dent'], regions: ['rear_bumper'], severities: ['high'], observationTypes: ['existing_damage_observed', 'possible_duplicate'],
  notes: ['repair estimate requested'],
  createdAt: '2026-07-21T04:00:00.000Z', updatedAt: '2026-07-21T04:10:00.000Z', uploadAt: '2026-07-21T04:00:00.000Z', latestDamageAt: '2026-07-21T04:09:00.000Z', firstDamageAt: '2026-07-18T04:00:00.000Z', activeDamageCount: 3,
}

const rows = [base, severe]
const zone = 'America/Los_Angeles'

test('global search finds driver, van, damage, region, notes and inspection identity', () => {
  for (const query of ['Jordan', 'Transit 12', 'scratch', 'driver side', 'check door', 'INS-001', 'inspection-1']) {
    const result = filterAndSortInspections(rows, { ...defaultInspectionSearchFilters, q: query }, zone)
    assert.deepEqual(result.map((row) => row.id), ['inspection-1'], query)
  }
})

test('latest upload, latest damage, severity and inspection sorts use repository timestamps', () => {
  assert.equal(filterAndSortInspections(rows, { ...defaultInspectionSearchFilters, sort: 'latest_upload' }, zone)[0]?.id, 'inspection-2')
  assert.equal(filterAndSortInspections(rows, { ...defaultInspectionSearchFilters, sort: 'newest_damage' }, zone)[0]?.id, 'inspection-2')
  assert.equal(filterAndSortInspections(rows, { ...defaultInspectionSearchFilters, sort: 'highest_severity' }, zone)[0]?.id, 'inspection-2')
  assert.equal(filterAndSortInspections(rows, { ...defaultInspectionSearchFilters, sort: 'oldest_inspection' }, zone)[0]?.id, 'inspection-1')
})

test('combined filters compose driver, van, damage, period, review and image state', () => {
  const result = filterAndSortInspections(rows, {
    ...defaultInspectionSearchFilters,
    driver: 'driver-2', van: 'van-77', severity: 'high', damageType: 'dent', region: 'rear_bumper',
    period: 'EOD', damageState: 'duplicate_observations', images: 'has_images',
  }, zone)
  assert.deepEqual(result.map((row) => row.id), ['inspection-2'])
})

test('search controls persist state in URL and expose an accessible mobile drawer', async () => {
  const source = await readFile(new URL('../../../components/van-damage/InspectionSearchControls.tsx', import.meta.url), 'utf8')
  assert.match(source, /new URLSearchParams\(searchParams\.toString\(\)\)/)
  assert.match(source, /next\.delete\('page'\)/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /lg:hidden/)
  assert.match(source, /setTimeout\(\(\) => update\(\{ q:/)
})

test('filtering a large in-memory result set remains linear and bounded', () => {
  const large = Array.from({ length: 10_000 }, (_, index) => ({ ...base, id: `inspection-${index}`, vanNumber: String(index) }))
  const started = performance.now()
  const result = filterAndSortInspections(large, { ...defaultInspectionSearchFilters, q: 'inspection-9999' }, zone)
  assert.equal(result.length, 1)
  assert.ok(performance.now() - started < 500)
})
