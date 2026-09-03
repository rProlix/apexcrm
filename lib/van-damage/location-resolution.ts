export type VanImageSide = 'driver' | 'passenger'

export type VehicleAreaResolution = {
  vehicleArea: string
  imageSide: VanImageSide | null
  corrected: boolean
  conflict: boolean
}

const SIDE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['front_bumper_driver', 'front_bumper_passenger'],
  ['rear_bumper_driver', 'rear_bumper_passenger'],
  ['driver_roof_edge', 'passenger_roof_edge'],
  ['driver_front_fender', 'passenger_front_fender'],
  ['driver_front_door', 'passenger_front_door'],
  ['driver_sliding_door', 'passenger_sliding_door'],
  ['driver_rear_door', 'passenger_rear_door'],
  ['driver_rear_lower_door', 'passenger_rear_lower_door'],
  ['driver_cargo_panel', 'passenger_cargo_panel'],
  ['driver_rear_cargo_panel', 'passenger_rear_cargo_panel'],
  ['driver_rear_quarter', 'passenger_rear_quarter'],
  ['driver_rocker_panel', 'passenger_rocker_panel'],
  ['driver_mirror', 'passenger_mirror'],
  ['driver_front_wheel', 'passenger_front_wheel'],
  ['driver_rear_wheel', 'passenger_rear_wheel'],
  ['driver_headlight', 'passenger_headlight'],
  ['driver_taillight', 'passenger_taillight'],
]

const DRIVER_TO_PASSENGER = new Map(SIDE_PAIRS)
const PASSENGER_TO_DRIVER = new Map(SIDE_PAIRS.map(([driver, passenger]) => [passenger, driver]))

export function resolveImageSide(imageRole: string | null | undefined): VanImageSide | null {
  const role = normalizeToken(imageRole)
  if (['driver', 'driver_side', 'left', 'left_side'].includes(role)) return 'driver'
  if (['passenger', 'passenger_side', 'right', 'right_side'].includes(role)) return 'passenger'
  return null
}

export function reconcileVehicleAreaWithImageRole(
  vehicleArea: string | null | undefined,
  imageRole: string | null | undefined
): VehicleAreaResolution {
  const area = normalizeToken(vehicleArea) || 'unknown'
  const imageSide = resolveImageSide(imageRole)
  if (!imageSide) return { vehicleArea: area, imageSide, corrected: false, conflict: false }

  const explicitSide = areaSide(area)
  const conflict = explicitSide !== null && explicitSide !== imageSide
  const paired =
    imageSide === 'driver' ? PASSENGER_TO_DRIVER.get(area) : DRIVER_TO_PASSENGER.get(area)
  if (paired) return { vehicleArea: paired, imageSide, corrected: true, conflict }

  const generic = genericAreaForSide(area, imageSide)
  if (generic !== area) {
    return {
      vehicleArea: generic,
      imageSide,
      corrected: true,
      conflict: explicitSide !== null && explicitSide !== imageSide,
    }
  }

  return { vehicleArea: area, imageSide, corrected: false, conflict }
}

function genericAreaForSide(area: string, side: VanImageSide): string {
  const prefix = side === 'driver' ? 'driver' : 'passenger'
  if (['driver_side', 'passenger_side'].includes(area)) return `${prefix}_cargo_panel`
  if (area === 'front_bumper') return `front_bumper_${prefix}`
  if (area === 'rear_bumper') return `rear_bumper_${prefix}`
  if (area === 'mirror') return `${prefix}_mirror`
  return area
}

function areaSide(area: string): VanImageSide | null {
  if (area.startsWith('driver_') || area.endsWith('_driver') || area === 'driver_side')
    return 'driver'
  if (area.startsWith('passenger_') || area.endsWith('_passenger') || area === 'passenger_side')
    return 'passenger'
  return null
}

function normalizeToken(value: string | null | undefined): string {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
    : ''
}
