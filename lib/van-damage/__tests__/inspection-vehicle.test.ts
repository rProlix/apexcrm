import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveInspectionVehicle,
  selectVehicleProfileImage,
  type InspectionVehicle,
  type VehicleResolutionLoaders,
} from '../inspection-vehicle'

function vehicle(id: string, tenantId: string, vanNumber = '64'): InspectionVehicle {
  return {
    id,
    tenant_id: tenantId,
    name: `Van ${vanNumber}`,
    van_number: vanNumber,
    make: 'Ford',
    model: 'Transit',
    year: 2019,
    color: null,
    plate_number: null,
    vin: null,
    status: 'active',
    metadata: {},
  }
}

function loaders(input: {
  vehicles?: InspectionVehicle[]
  session?: { id: string; vanId: string | null } | null
}) {
  const calls: Array<{ operation: string; tenantId: string }> = []
  const value: VehicleResolutionLoaders = {
    async loadVehicleById(tenantId, vehicleId) {
      calls.push({ operation: 'id', tenantId })
      return (
        input.vehicles?.find(
          (candidate) => candidate.tenant_id === tenantId && candidate.id === vehicleId
        ) ?? null
      )
    },
    async loadUploadSession(tenantId) {
      calls.push({ operation: 'session', tenantId })
      return input.session ?? null
    },
    async loadVehiclesByNumber(tenantId, vanNumber) {
      calls.push({ operation: 'number', tenantId })
      return (
        input.vehicles?.filter(
          (candidate) => candidate.tenant_id === tenantId && candidate.van_number === vanNumber
        ) ?? []
      ).slice(0, 2)
    },
  }
  return { value, calls }
}

const base = {
  tenantId: 'tenant-a',
  businessId: 'tenant-a',
  inspectionId: 'inspection-a',
  inspectionVanId: null,
  uploadSessionId: null,
  metadata: {},
}

test('canonical inspection van ID wins and remains tenant scoped', async () => {
  const mock = loaders({ vehicles: [vehicle('van-a', 'tenant-a'), vehicle('van-a', 'tenant-b')] })
  const result = await resolveInspectionVehicle({ ...base, inspectionVanId: 'van-a' }, mock.value)
  assert.equal(result.state, 'resolved')
  assert.equal(result.source, 'inspection_van_id')
  assert.equal(result.vehicle?.tenant_id, 'tenant-a')
  assert.deepEqual(mock.calls, [{ operation: 'id', tenantId: 'tenant-a' }])
})

test('upload session resolves a legacy inspection before van-number fallback', async () => {
  const mock = loaders({
    vehicles: [vehicle('van-session', 'tenant-a')],
    session: { id: 'session-a', vanId: 'van-session' },
  })
  const result = await resolveInspectionVehicle(base, mock.value)
  assert.equal(result.state, 'resolved')
  assert.equal(result.source, 'upload_session_van_id')
  assert.equal(result.vehicle?.id, 'van-session')
})

test('legacy van-number fallback is tenant scoped and rejects ambiguity', async () => {
  const isolated = loaders({
    vehicles: [vehicle('van-a', 'tenant-a'), vehicle('van-b', 'tenant-b')],
  })
  const resolved = await resolveInspectionVehicle(
    { ...base, metadata: { vanNumber: '64' } },
    isolated.value
  )
  assert.equal(resolved.state, 'resolved')
  assert.equal(resolved.vehicle?.id, 'van-a')

  const ambiguous = loaders({
    vehicles: [vehicle('van-a', 'tenant-a'), vehicle('van-c', 'tenant-a')],
  })
  const unresolved = await resolveInspectionVehicle(
    { ...base, metadata: { vanNumber: '64' } },
    ambiguous.value
  )
  assert.equal(unresolved.state, 'ambiguous')
  assert.equal(unresolved.vehicle, null)
})

test('stale cross-tenant canonical ID never resolves another tenant vehicle', async () => {
  const mock = loaders({ vehicles: [vehicle('stale-id', 'tenant-b')] })
  const result = await resolveInspectionVehicle(
    { ...base, inspectionVanId: 'stale-id' },
    mock.value
  )
  assert.equal(result.state, 'missing')
})

test('vehicle profile image precedence never chooses an unrelated random inspection image', () => {
  const candidates = [
    { id: 'random', imageRole: null, createdAt: '2026-07-23T12:00:00Z' },
    { id: 'front', imageRole: 'front', createdAt: '2026-07-22T12:00:00Z' },
    { id: 'primary', imageRole: null, createdAt: '2026-07-20T12:00:00Z' },
  ]
  assert.deepEqual(
    selectVehicleProfileImage({ vanDamage: { profileImage: { imageId: 'primary' } } }, candidates),
    { imageId: 'primary', source: 'primary_profile' }
  )
  assert.deepEqual(selectVehicleProfileImage({}, candidates), {
    imageId: 'front',
    source: 'approved_vehicle_image',
  })
  assert.deepEqual(
    selectVehicleProfileImage({}, [
      { id: 'random', imageRole: null, createdAt: '2026-07-23T12:00:00Z' },
    ]),
    { imageId: null, source: 'placeholder' }
  )
  assert.deepEqual(
    selectVehicleProfileImage(
      {},
      [
        {
          id: 'later',
          imageRole: null,
          createdAt: '2026-07-23T12:00:00Z',
          uploadOrder: 2,
        },
        {
          id: 'first',
          imageRole: null,
          createdAt: '2026-07-23T12:01:00Z',
          uploadOrder: 0,
        },
      ],
      { allowAutomaticFirstUpload: true }
    ),
    { imageId: 'first', source: 'automatic_first_upload' }
  )
})
