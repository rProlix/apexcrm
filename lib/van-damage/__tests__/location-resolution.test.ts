import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reconcileVehicleAreaWithImageRole,
  resolveImageSide,
} from '../location-resolution'

test('image roles resolve from vehicle perspective', () => {
  assert.equal(resolveImageSide('driver_side'), 'driver')
  assert.equal(resolveImageSide('left side'), 'driver')
  assert.equal(resolveImageSide('passenger_side'), 'passenger')
  assert.equal(resolveImageSide('right'), 'passenger')
  assert.equal(resolveImageSide('front'), null)
})

test('opposite-side AI regions are corrected using the source image role', () => {
  assert.deepEqual(reconcileVehicleAreaWithImageRole('driver_front_door', 'passenger_side'), {
    vehicleArea: 'passenger_front_door',
    imageSide: 'passenger',
    corrected: true,
    conflict: true,
  })
  assert.deepEqual(reconcileVehicleAreaWithImageRole('passenger_rear_quarter', 'driver_side'), {
    vehicleArea: 'driver_rear_quarter',
    imageSide: 'driver',
    corrected: true,
    conflict: true,
  })
})

test('generic visible-side regions become side-specific without inventing a panel', () => {
  assert.equal(
    reconcileVehicleAreaWithImageRole('rear bumper', 'passenger_side').vehicleArea,
    'rear_bumper_passenger'
  )
  assert.equal(
    reconcileVehicleAreaWithImageRole('door', 'passenger_side').vehicleArea,
    'door'
  )
})

test('front, rear, and unknown roles do not force a vehicle side', () => {
  for (const role of ['front', 'rear', 'unknown', null]) {
    assert.deepEqual(reconcileVehicleAreaWithImageRole('driver_front_door', role), {
      vehicleArea: 'driver_front_door',
      imageSide: null,
      corrected: false,
      conflict: false,
    })
  }
})
