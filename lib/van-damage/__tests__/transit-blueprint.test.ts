import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TRANSIT_CONFIGURATION,
  DRIVER_SLIDING_DOOR_REGION,
  GENERIC_BLUEPRINT_ID,
  TRANSIT_BLUEPRINT_ID,
  TRANSIT_VIEW_ORDER,
  TRANSIT_VIEW_REGIONS,
  PASSENGER_CARGO_PANEL_REGION,
  buildTransitRegionAriaLabel,
  classifyTransitRegionState,
  getTransitViewForRegion,
  normalizeTransitRegion,
  resolveItemTransitRegion,
  resolveTransitConfiguration,
  resolveVehicleBlueprint,
  transitRegionMatches,
} from '../transit-blueprint'

test('full-size 2019 Transit labels select the Transit blueprint', () => {
  const labels = [
    'Transit',
    'Transit Cargo Van',
    'Ford Transit Cargo',
    'T-150',
    'T-250',
    'T-350',
    'Transit 150',
    'Transit 250',
    'Transit 350',
  ]
  for (const model of labels) {
    assert.equal(
      resolveVehicleBlueprint({ make: 'Ford', model, year: 2019 }),
      TRANSIT_BLUEPRINT_ID,
      model
    )
  }
  assert.equal(
    resolveVehicleBlueprint({ make: null, model: 'Ford Transit', year: null }),
    TRANSIT_BLUEPRINT_ID
  )
})

test('Transit Connect, post-facelift Transit, and unknown vehicles use the safe generic fallback', () => {
  assert.equal(
    resolveVehicleBlueprint({ make: 'Ford', model: 'Transit Connect', year: 2019 }),
    GENERIC_BLUEPRINT_ID
  )
  assert.equal(
    resolveVehicleBlueprint({ make: 'Ford', model: 'Transit T-250', year: 2022 }),
    GENERIC_BLUEPRINT_ID
  )
  assert.equal(
    resolveVehicleBlueprint({ make: 'Mercedes-Benz', model: 'Sprinter', year: 2019 }),
    GENERIC_BLUEPRINT_ID
  )
  assert.equal(
    resolveVehicleBlueprint({ make: null, model: 'Unknown vehicle', year: null }),
    GENERIC_BLUEPRINT_ID
  )
  assert.equal(resolveVehicleBlueprint(null), TRANSIT_BLUEPRINT_ID)
  assert.equal(
    resolveVehicleBlueprint({ make: null, model: null, year: null }),
    TRANSIT_BLUEPRINT_ID
  )
})

test('Transit configuration defaults and supported metadata variants resolve deterministically', () => {
  assert.deepEqual(resolveTransitConfiguration(null), DEFAULT_TRANSIT_CONFIGURATION)
  assert.deepEqual(
    resolveTransitConfiguration({
      metadata: {
        wheelBase: 'extended length',
        roof_height: 'high roof',
        rear_wheels: 'DRW',
        sliding_door_side: 'both',
        body_style: 'passenger shuttle',
      },
    }),
    {
      wheelbase: 'extended',
      roofHeight: 'high',
      rearWheels: 'dual',
      slidingDoor: 'both',
      cargoConfiguration: 'passenger',
    }
  )
  assert.deepEqual(
    resolveTransitConfiguration({
      metadata: {
        wheelbase: 'regular',
        roof: 'low',
        rearWheels: 'single',
        slidingDoorSide: 'driver',
        vehicleType: 'cargo',
      },
    }),
    {
      wheelbase: 'regular',
      roofHeight: 'low',
      rearWheels: 'single',
      slidingDoor: 'driver',
      cargoConfiguration: 'cargo',
    }
  )
})

test('all five orthographic views have valid, labeled, stable and unique interactive regions', () => {
  assert.deepEqual(TRANSIT_VIEW_ORDER, ['driver', 'passenger', 'front', 'rear', 'top'])
  for (const view of TRANSIT_VIEW_ORDER) {
    const regions = TRANSIT_VIEW_REGIONS[view]
    assert.ok(regions.length >= 10, `${view} should expose useful panel geometry`)
    assert.equal(new Set(regions.map((region) => region.id)).size, regions.length, `${view} IDs`)
    for (const region of regions) {
      assert.equal(region.view, view)
      assert.ok(region.id.length > 2)
      assert.ok(region.label.length > 2)
      assert.match(region.path, /^[ML]/)
      assert.ok(region.labelX >= 0 && region.labelX <= 800)
      assert.ok(region.labelY >= 0 && region.labelY <= 360)
    }
  }
})

test('Transit-specific passenger, driver, rear-door and lighting geometry is not blindly mirrored', () => {
  const driverIds = new Set(TRANSIT_VIEW_REGIONS.driver.map((region) => region.id))
  const passengerIds = new Set(TRANSIT_VIEW_REGIONS.passenger.map((region) => region.id))
  const rearIds = new Set(TRANSIT_VIEW_REGIONS.rear.map((region) => region.id))
  assert.ok(driverIds.has('driver_front_door'))
  assert.ok(!driverIds.has('passenger_sliding_door'))
  assert.ok(passengerIds.has('passenger_front_door'))
  assert.ok(passengerIds.has('passenger_sliding_door'))
  assert.ok(rearIds.has('driver_rear_door'))
  assert.ok(rearIds.has('passenger_rear_door'))
  assert.ok(rearIds.has('rear_door_center_seam'))
  assert.ok(rearIds.has('driver_taillight'))
  assert.ok(rearIds.has('passenger_taillight'))
  assert.equal(DRIVER_SLIDING_DOOR_REGION.view, 'driver')
  assert.equal(PASSENGER_CARGO_PANEL_REGION.view, 'passenger')
})

test('side-view wheel positions remain coherent across driver and passenger views', () => {
  for (const axle of ['front', 'rear'] as const) {
    const driver = TRANSIT_VIEW_REGIONS.driver.find(
      (region) => region.id === `driver_${axle}_wheel`
    )
    const passenger = TRANSIT_VIEW_REGIONS.passenger.find(
      (region) => region.id === `passenger_${axle}_wheel`
    )
    assert.ok(driver)
    assert.ok(passenger)
    assert.equal(driver.labelX, passenger.labelX)
    assert.equal(driver.labelY, passenger.labelY)
    assert.equal(driver.path, passenger.path)
  }
})

test('historical and detailed canonical regions map to compatible Transit panels and views', () => {
  assert.equal(normalizeTransitRegion('front_bumper'), 'front_bumper')
  assert.equal(normalizeTransitRegion('left rear door'), 'driver_rear_door')
  assert.equal(normalizeTransitRegion('right tail light'), 'passenger_taillight')
  assert.equal(normalizeTransitRegion('passenger sliding cargo door'), 'passenger_sliding_door')
  assert.equal(normalizeTransitRegion('driver sliding cargo door'), 'driver_sliding_door')
  assert.equal(normalizeTransitRegion('driver side'), 'driver_cargo_panel')
  assert.equal(normalizeTransitRegion('tailgate'), 'driver_rear_door')
  assert.equal(normalizeTransitRegion('interior'), null)
  assert.equal(normalizeTransitRegion('historical mystery zone'), null)
  assert.equal(getTransitViewForRegion('passenger_sliding_door'), 'passenger')
  assert.equal(getTransitViewForRegion('driver_rear_door'), 'rear')
  assert.equal(getTransitViewForRegion('roof_center'), 'top')
})

test('human-reviewed canonical location wins over the raw vehicle-area label', () => {
  assert.equal(
    resolveItemTransitRegion({
      canonical_region: 'passenger_sliding_door',
      vehicle_area: 'driver side',
    }),
    'passenger_sliding_door'
  )
  assert.equal(
    resolveItemTransitRegion({ canonical_region: null, vehicle_area: 'rear bumper' }),
    'rear_bumper'
  )
  assert.equal(
    transitRegionMatches('front_bumper_driver', { canonical_region: 'front_bumper' }),
    true
  )
  assert.equal(
    transitRegionMatches('passenger_sliding_door', { vehicle_area: 'driver front door' }),
    false
  )
})

test('region accessibility text communicates severity, count, review, confirmation and selection without color', () => {
  assert.equal(
    buildTransitRegionAriaLabel({
      label: 'Passenger sliding cargo door',
      severity: 'high',
      findingCount: 2,
      needsReview: true,
      confirmed: true,
      selected: true,
    }),
    'Passenger sliding cargo door, high damage, 2 findings, needs review, human confirmed, selected'
  )
  assert.equal(
    buildTransitRegionAriaLabel({
      label: 'Driver rear door',
      severity: 'low',
      findingCount: 1,
      repaired: true,
    }),
    'Driver rear door, repaired, 1 finding'
  )
})

test('selected, severity, review, confirmed, repaired, and dismissed map states remain distinct', () => {
  assert.equal(classifyTransitRegionState({ findingCount: 0, severity: 'unknown' }), 'empty')
  assert.equal(
    classifyTransitRegionState({ findingCount: 0, severity: 'unknown', selected: true }),
    'selected-empty'
  )
  assert.equal(
    classifyTransitRegionState({
      findingCount: 2,
      severity: 'high',
      needsReview: true,
      confirmed: true,
      selected: true,
    }),
    'high-needs-review-confirmed-selected'
  )
  assert.equal(
    classifyTransitRegionState({ findingCount: 1, severity: 'low', repaired: true }),
    'repaired'
  )
  assert.equal(
    classifyTransitRegionState({ findingCount: 1, severity: 'critical', dismissed: true }),
    'dismissed'
  )
})
