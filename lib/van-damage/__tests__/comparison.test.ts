import assert from 'node:assert/strict'
import test from 'node:test'
import { findComparablePriorInspection, type ComparableInspection } from '../comparison'

const currentImages = [
  { id: 'current-front', view: 'front' as const, quality: 'acceptable' as const },
]
function candidate(overrides: Partial<ComparableInspection>): ComparableInspection {
  return {
    id: 'prior',
    tenantId: 'tenant-a',
    vanId: 'van-a',
    inspectedAt: '2026-07-20T10:00:00Z',
    inspectionType: 'SOD',
    status: 'completed',
    reviewStatus: 'reviewed',
    images: [{ id: 'prior-front', view: 'front', quality: 'acceptable' }],
    ...overrides,
  }
}

test('selects most recent valid same-tenant same-van comparable evidence', () => {
  const result = findComparablePriorInspection({
    tenantId: 'tenant-a',
    vanId: 'van-a',
    currentInspectionId: 'current',
    currentTimestamp: '2026-07-27T10:00:00Z',
    currentImages,
    candidates: [
      candidate({ id: 'wrong-tenant', tenantId: 'tenant-b', inspectedAt: '2026-07-26T10:00:00Z' }),
      candidate({ id: 'wrong-van', vanId: 'van-b', inspectedAt: '2026-07-25T10:00:00Z' }),
      candidate({ id: 'latest-invalid', wrongVan: true, inspectedAt: '2026-07-24T10:00:00Z' }),
      candidate({ id: 'valid', inspectedAt: '2026-07-23T10:00:00Z' }),
    ],
  })
  assert.equal(result?.inspection.id, 'valid')
  assert.equal(result?.pairs[0].canonicalView, 'front')
})

test('does not pair images by upload order or uncertain view', () => {
  const result = findComparablePriorInspection({
    tenantId: 'tenant-a',
    vanId: 'van-a',
    currentInspectionId: 'current',
    currentTimestamp: '2026-07-27T10:00:00Z',
    currentImages,
    candidates: [
      candidate({
        images: [{ id: 'prior-rear', view: 'rear', quality: 'acceptable' }],
      }),
    ],
  })
  assert.equal(result, null)
})
