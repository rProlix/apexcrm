import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TRANSIT_CONFIGURATION,
  TRANSIT_VIEW_ORDER,
  getTransitViewRegions,
  type TransitMapConfiguration,
} from '../transit-blueprint'
import { createTransitGeometry } from '../transit-geometry'

function configured(overrides: Partial<TransitMapConfiguration> = {}): TransitMapConfiguration {
  return { ...DEFAULT_TRANSIT_CONFIGURATION, ...overrides }
}

test('default geometry is the explicit 148-inch regular-body medium-roof SRW cargo van', () => {
  assert.deepEqual(DEFAULT_TRANSIT_CONFIGURATION, {
    wheelbaseInches: 148,
    bodyLength: 'regular',
    roofHeight: 'medium',
    rearWheels: 'single',
    slidingDoor: 'passenger',
    cargoConfiguration: 'cargo',
    rearDoorWindows: false,
  })
  const geometry = createTransitGeometry(DEFAULT_TRANSIT_CONFIGURATION)
  assert.equal(geometry.dimensions.overallLength, 235.5)
  assert.equal(geometry.dimensions.wheelbase, 147.6)
  assert.equal(geometry.dimensions.frontOverhang, 40.3)
  assert.ok(Math.abs(geometry.dimensions.rearOverhang - 47.6) < 0.001)
  assert.ok(
    Math.abs(geometry.side.rearAxle - geometry.side.frontAxle - 147.6 * geometry.side.scale) < 0.001
  )
})

test('148 extended changes rear overhang while preserving physical axle spacing', () => {
  const regular = createTransitGeometry(configured())
  const extended = createTransitGeometry(configured({ bodyLength: 'extended' }))
  assert.equal(extended.dimensions.overallLength, 263.9)
  assert.equal(regular.dimensions.frontOverhang, extended.dimensions.frontOverhang)
  assert.equal(regular.dimensions.wheelbase, extended.dimensions.wheelbase)
  assert.equal(regular.side.rearEdge, extended.side.rearEdge)
  assert.ok(extended.dimensions.rearOverhang > regular.dimensions.rearOverhang)
})

test('130 and roof variants resolve their published dimensional anchors', () => {
  const regular148 = createTransitGeometry(configured())
  const regular130 = createTransitGeometry(configured({ wheelbaseInches: 130 }))
  assert.equal(regular130.dimensions.overallLength, 217.8)
  assert.ok(regular130.side.rearAxle < regular148.side.rearAxle)
  const low = createTransitGeometry(configured({ roofHeight: 'low' }))
  const high = createTransitGeometry(configured({ roofHeight: 'high' }))
  assert.ok(low.side.roofY > regular148.side.roofY)
  assert.ok(high.side.roofY < regular148.side.roofY)
  assert.equal(low.dimensions.frontOverhang, high.dimensions.frontOverhang)
  assert.equal(low.dimensions.wheelbase, high.dimensions.wheelbase)
  assert.equal(low.dimensions.rearOverhang, 49.7)
  assert.ok(Math.abs(high.dimensions.rearOverhang - 47.6) < 0.001)
})

test('all generated view regions remain finite and within the calibration canvas', () => {
  const variants = [
    configured(),
    configured({ wheelbaseInches: 130, roofHeight: 'low' }),
    configured({ bodyLength: 'extended', roofHeight: 'high', rearWheels: 'dual' }),
  ]
  for (const variant of variants) {
    const regions = getTransitViewRegions(variant)
    for (const view of TRANSIT_VIEW_ORDER) {
      for (const region of regions[view]) {
        assert.match(region.path, /^M/)
        assert.ok(!region.path.includes('NaN'), `${view}/${region.id}`)
        assert.ok(region.labelX >= 0 && region.labelX <= 800, `${view}/${region.id} x`)
        assert.ok(region.labelY >= 0 && region.labelY <= 400, `${view}/${region.id} y`)
      }
    }
  }
})

test('door and window variants preserve canonical IDs while changing visible panels', () => {
  const cargo = getTransitViewRegions(configured())
  const driverDoor = getTransitViewRegions(configured({ slidingDoor: 'driver' }))
  assert.ok(cargo.passenger.some((region) => region.id === 'passenger_sliding_door'))
  assert.ok(driverDoor.driver.some((region) => region.id === 'driver_sliding_door'))
  assert.ok(driverDoor.passenger.some((region) => region.id === 'passenger_cargo_panel'))
})

test('SRW and DRW projections use the configured published body width', () => {
  assert.equal(createTransitGeometry(configured()).dimensions.bodyWidth, 81.3)
  assert.equal(createTransitGeometry(configured({ rearWheels: 'dual' })).dimensions.bodyWidth, 83.7)
})
