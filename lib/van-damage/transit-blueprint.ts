import { buildPrecisionTransitRegions } from './transit-geometry'

export const TRANSIT_BLUEPRINT_ID = 'ford_transit_2019' as const
export const GENERIC_BLUEPRINT_ID = 'generic_vehicle' as const

export type VehicleBlueprintId = typeof TRANSIT_BLUEPRINT_ID | typeof GENERIC_BLUEPRINT_ID
export type TransitView = 'driver' | 'passenger' | 'front' | 'rear' | 'top'
export type TransitWheelbaseInches = 130 | 148
export type TransitBodyLength = 'regular' | 'extended'
export type TransitRoofHeight = 'low' | 'medium' | 'high'
export type TransitRearWheels = 'single' | 'dual'
export type TransitSlidingDoor = 'passenger' | 'driver' | 'both' | 'none'

export type TransitMapConfiguration = {
  wheelbaseInches: TransitWheelbaseInches
  bodyLength: TransitBodyLength
  roofHeight: TransitRoofHeight
  rearWheels: TransitRearWheels
  slidingDoor: TransitSlidingDoor
  cargoConfiguration: 'cargo' | 'passenger'
  rearDoorWindows: boolean
}

export type VehicleBlueprintInput = {
  make?: string | null
  model?: string | null
  year?: number | null
  metadata?: Record<string, unknown> | null
} | null

export type TransitRegionMetadata = {
  id: string
  label: string
  view: TransitView
  aliases?: readonly string[]
  small?: boolean
}

export type TransitRegionDefinition = TransitRegionMetadata & {
  path: string
  labelX: number
  labelY: number
}

export const DEFAULT_TRANSIT_CONFIGURATION: TransitMapConfiguration = {
  wheelbaseInches: 148,
  bodyLength: 'regular',
  roofHeight: 'medium',
  rearWheels: 'single',
  slidingDoor: 'passenger',
  cargoConfiguration: 'cargo',
  rearDoorWindows: false,
}

const TRANSIT_MODEL_PATTERN =
  /\b(?:ford\s+)?transit(?:\s+(?:cargo(?:\s+van)?|van|150|250|350))?\b|\bt[- ]?(?:150|250|350)\b/i
const TRANSIT_CONNECT_PATTERN = /\btransit\s+connect\b/i

function normalizedText(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    : ''
}

function metadataText(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return normalizedText(value)
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function metadataBoolean(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = normalizedText(value)
      if (['true', 'yes', 'present', 'windowed', 'glass'].includes(normalized)) return true
      if (['false', 'no', 'absent', 'windowless', 'solid'].includes(normalized)) return false
    }
  }
  return null
}

export function resolveVehicleBlueprint(vehicle: VehicleBlueprintInput): VehicleBlueprintId {
  if (!vehicle) return TRANSIT_BLUEPRINT_ID
  const make = normalizedText(vehicle.make)
  const model = normalizedText(vehicle.model)
  const identity = `${make} ${model}`.trim()
  if (!identity) return TRANSIT_BLUEPRINT_ID
  if (TRANSIT_CONNECT_PATTERN.test(identity)) return GENERIC_BLUEPRINT_ID
  if (!TRANSIT_MODEL_PATTERN.test(identity)) return GENERIC_BLUEPRINT_ID
  if (vehicle.year && vehicle.year >= 2020) return GENERIC_BLUEPRINT_ID
  return TRANSIT_BLUEPRINT_ID
}

export function resolveTransitConfiguration(
  vehicle: VehicleBlueprintInput
): TransitMapConfiguration {
  const metadata = vehicle?.metadata ?? {}
  const wheelbaseText = metadataText(
    metadata,
    'wheelbase',
    'wheelBase',
    'lengthVariant',
    'bodyLength'
  )
  const roofText = metadataText(metadata, 'roofHeight', 'roof_height', 'roof', 'heightVariant')
  const wheelsText = metadataText(
    metadata,
    'rearWheelConfiguration',
    'rear_wheel_configuration',
    'rearWheels',
    'rear_wheels'
  )
  const doorText = metadataText(
    metadata,
    'slidingDoorSide',
    'sliding_door_side',
    'cargoDoorSide',
    'cargo_door_side'
  )
  const bodyText = metadataText(
    metadata,
    'bodyStyle',
    'body_style',
    'configuration',
    'vehicleType',
    'vehicle_type'
  )
  const rearDoorText = metadataText(
    metadata,
    'rearDoorWindows',
    'rear_door_windows',
    'rearDoorGlazing',
    'rear_door_glazing'
  )
  const rearDoorWindows = metadataBoolean(
    metadata,
    'rearDoorWindows',
    'rear_door_windows',
    'rearDoorGlazing',
    'rear_door_glazing'
  )
  const wheelbaseInches: TransitWheelbaseInches =
    wheelbaseText.includes('130') || wheelbaseText.includes('short') ? 130 : 148
  const requestedExtended = wheelbaseText.includes('extended') || bodyText.includes('extended')

  return {
    wheelbaseInches,
    bodyLength: wheelbaseInches === 148 && requestedExtended ? 'extended' : 'regular',
    roofHeight: roofText.includes('high') ? 'high' : roofText.includes('low') ? 'low' : 'medium',
    rearWheels: wheelsText.includes('dual') || wheelsText.includes('drw') ? 'dual' : 'single',
    slidingDoor: doorText.includes('both')
      ? 'both'
      : doorText.includes('driver') || doorText.includes('left')
        ? 'driver'
        : doorText.includes('none')
          ? 'none'
          : 'passenger',
    cargoConfiguration:
      bodyText.includes('passenger') || bodyText.includes('shuttle') ? 'passenger' : 'cargo',
    rearDoorWindows:
      rearDoorWindows ??
      (rearDoorText.includes('window') ||
        rearDoorText.includes('glass') ||
        bodyText.includes('passenger')),
  }
}

export const TRANSIT_VIEW_LABELS: Record<TransitView, string> = {
  driver: 'Driver side',
  passenger: 'Passenger side',
  front: 'Front',
  rear: 'Rear',
  top: 'Top',
}

export const TRANSIT_VIEW_ORDER: readonly TransitView[] = [
  'driver',
  'passenger',
  'front',
  'rear',
  'top',
]

export const DRIVER_SLIDING_DOOR_REGION: TransitRegionMetadata = {
  id: 'driver_sliding_door',
  label: 'Driver sliding cargo door',
  view: 'driver',
  aliases: [
    'driver_cargo_door',
    'left_sliding_door',
    'driver_cargo_panel',
    'driver_side',
    'left_side',
  ],
}

export const PASSENGER_CARGO_PANEL_REGION: TransitRegionMetadata = {
  id: 'passenger_cargo_panel',
  label: 'Passenger cargo panel',
  view: 'passenger',
  aliases: ['passenger_side', 'right_side', 'side_panel'],
}

const TRANSIT_REGION_METADATA: Record<TransitView, readonly TransitRegionMetadata[]> = {
  driver: [
    {
      id: 'front_bumper_driver',
      label: 'Driver front bumper corner',
      view: 'driver',
      aliases: ['driver_front_bumper', 'front_bumper'],
      small: true,
    },
    {
      id: 'driver_headlight',
      label: 'Driver headlight',
      view: 'driver',
      aliases: ['headlight', 'front_light'],
      small: true,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'driver',
    },
    {
      id: 'windshield',
      label: 'Windshield',
      view: 'driver',
    },
    {
      id: 'driver_mirror',
      label: 'Driver mirror',
      view: 'driver',
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'driver_front_fender',
      label: 'Driver front fender',
      view: 'driver',
    },
    {
      id: 'driver_front_door',
      label: 'Driver front door',
      view: 'driver',
      aliases: ['front_door', 'door'],
    },
    {
      id: 'driver_cargo_panel',
      label: 'Driver cargo panel',
      view: 'driver',
      aliases: ['driver_side', 'left_side', 'side_panel'],
    },
    {
      id: 'driver_rear_cargo_panel',
      label: 'Driver rear cargo panel',
      view: 'driver',
      aliases: ['driver_rear_panel', 'rear_panel'],
    },
    {
      id: 'driver_rear_quarter',
      label: 'Driver rear quarter',
      view: 'driver',
      aliases: ['rear_quarter'],
    },
    {
      id: 'driver_rocker_panel',
      label: 'Driver rocker panel',
      view: 'driver',
      aliases: ['rocker_panel'],
      small: true,
    },
    {
      id: 'driver_front_wheel',
      label: 'Driver front wheel',
      view: 'driver',
      aliases: ['front_wheel', 'wheel'],
    },
    {
      id: 'driver_rear_wheel',
      label: 'Driver rear wheel',
      view: 'driver',
      aliases: ['rear_wheel', 'wheel'],
    },
    {
      id: 'rear_bumper_driver',
      label: 'Driver rear bumper corner',
      view: 'driver',
      aliases: ['driver_rear_bumper', 'rear_bumper'],
      small: true,
    },
    {
      id: 'roof_front',
      label: 'Driver roof edge',
      view: 'driver',
      aliases: ['roof', 'driver_roof_edge'],
    },
  ],
  passenger: [
    {
      id: 'front_bumper_passenger',
      label: 'Passenger front bumper corner',
      view: 'passenger',
      aliases: ['passenger_front_bumper', 'front_bumper'],
      small: true,
    },
    {
      id: 'passenger_headlight',
      label: 'Passenger headlight',
      view: 'passenger',
      aliases: ['headlight', 'front_light'],
      small: true,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'passenger',
    },
    {
      id: 'windshield',
      label: 'Windshield',
      view: 'passenger',
    },
    {
      id: 'passenger_mirror',
      label: 'Passenger mirror',
      view: 'passenger',
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'passenger_front_fender',
      label: 'Passenger front fender',
      view: 'passenger',
    },
    {
      id: 'passenger_front_door',
      label: 'Passenger front door',
      view: 'passenger',
      aliases: ['front_door', 'door'],
    },
    {
      id: 'passenger_sliding_door',
      label: 'Passenger sliding cargo door',
      view: 'passenger',
      aliases: [
        'sliding_door',
        'cargo_door',
        'passenger_cargo_panel',
        'passenger_side',
        'right_side',
      ],
    },
    {
      id: 'passenger_rear_cargo_panel',
      label: 'Passenger rear cargo panel',
      view: 'passenger',
      aliases: ['passenger_rear_panel', 'rear_panel'],
    },
    {
      id: 'passenger_rear_quarter',
      label: 'Passenger rear quarter',
      view: 'passenger',
      aliases: ['rear_quarter'],
    },
    {
      id: 'passenger_rocker_panel',
      label: 'Passenger rocker panel',
      view: 'passenger',
      aliases: ['rocker_panel'],
      small: true,
    },
    {
      id: 'passenger_front_wheel',
      label: 'Passenger front wheel',
      view: 'passenger',
      aliases: ['front_wheel', 'wheel'],
    },
    {
      id: 'passenger_rear_wheel',
      label: 'Passenger rear wheel',
      view: 'passenger',
      aliases: ['rear_wheel', 'wheel'],
    },
    {
      id: 'rear_bumper_passenger',
      label: 'Passenger rear bumper corner',
      view: 'passenger',
      aliases: ['passenger_rear_bumper', 'rear_bumper'],
      small: true,
    },
    {
      id: 'roof_front',
      label: 'Passenger roof edge',
      view: 'passenger',
      aliases: ['roof', 'passenger_roof_edge'],
    },
  ],
  front: [
    {
      id: 'roof_front',
      label: 'Front roof section',
      view: 'front',
      aliases: ['roof'],
    },
    {
      id: 'windshield',
      label: 'Windshield',
      view: 'front',
    },
    {
      id: 'driver_mirror',
      label: 'Driver mirror',
      view: 'front',
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'passenger_mirror',
      label: 'Passenger mirror',
      view: 'front',
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'front',
    },
    {
      id: 'driver_headlight',
      label: 'Driver headlight',
      view: 'front',
      aliases: ['headlight'],
      small: true,
    },
    {
      id: 'passenger_headlight',
      label: 'Passenger headlight',
      view: 'front',
      aliases: ['headlight'],
      small: true,
    },
    {
      id: 'driver_front_fender',
      label: 'Driver front fender edge',
      view: 'front',
    },
    {
      id: 'passenger_front_fender',
      label: 'Passenger front fender edge',
      view: 'front',
    },
    {
      id: 'upper_grille',
      label: 'Upper grille',
      view: 'front',
      aliases: ['grille'],
      small: true,
    },
    {
      id: 'lower_grille',
      label: 'Lower grille',
      view: 'front',
      aliases: ['grille', 'front_center'],
    },
    {
      id: 'front_bumper_driver',
      label: 'Driver front bumper corner',
      view: 'front',
      aliases: ['driver_front_bumper', 'front_bumper'],
    },
    {
      id: 'front_bumper',
      label: 'Front bumper center',
      view: 'front',
    },
    {
      id: 'front_bumper_passenger',
      label: 'Passenger front bumper corner',
      view: 'front',
      aliases: ['passenger_front_bumper', 'front_bumper'],
    },
  ],
  rear: [
    {
      id: 'roof_rear',
      label: 'Rear roof section',
      view: 'rear',
      aliases: ['roof'],
    },
    {
      id: 'driver_rear_door',
      label: 'Driver split rear door',
      view: 'rear',
      aliases: ['left_rear_door', 'rear_door', 'cargo_door', 'tailgate', 'liftgate', 'rear_panel'],
    },
    {
      id: 'passenger_rear_door',
      label: 'Passenger split rear door',
      view: 'rear',
      aliases: ['right_rear_door', 'rear_door', 'cargo_door', 'tailgate', 'liftgate', 'rear_panel'],
    },
    {
      id: 'rear_door_center_seam',
      label: 'Rear-door center seam',
      view: 'rear',
      aliases: ['rear_door_seam'],
      small: true,
    },
    {
      id: 'driver_taillight',
      label: 'Driver taillight',
      view: 'rear',
      aliases: ['left_taillight', 'taillight'],
      small: true,
    },
    {
      id: 'passenger_taillight',
      label: 'Passenger taillight',
      view: 'rear',
      aliases: ['right_taillight', 'taillight'],
      small: true,
    },
    {
      id: 'driver_rear_lower_door',
      label: 'Driver rear lower door',
      view: 'rear',
      aliases: ['rear_lower_panel'],
    },
    {
      id: 'passenger_rear_lower_door',
      label: 'Passenger rear lower door',
      view: 'rear',
      aliases: ['rear_lower_panel'],
    },
    {
      id: 'rear_bumper_driver',
      label: 'Driver rear bumper corner',
      view: 'rear',
      aliases: ['driver_rear_bumper', 'rear_bumper'],
    },
    {
      id: 'rear_bumper',
      label: 'Rear bumper center',
      view: 'rear',
    },
    {
      id: 'rear_bumper_passenger',
      label: 'Passenger rear bumper corner',
      view: 'rear',
      aliases: ['passenger_rear_bumper', 'rear_bumper'],
    },
  ],
  top: [
    {
      id: 'front_bumper',
      label: 'Front bumper edge',
      view: 'top',
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'top',
    },
    {
      id: 'windshield',
      label: 'Windshield boundary',
      view: 'top',
      small: true,
    },
    {
      id: 'roof_front',
      label: 'Front roof',
      view: 'top',
      aliases: ['roof'],
    },
    {
      id: 'roof_center',
      label: 'Center roof',
      view: 'top',
      aliases: ['roof'],
    },
    {
      id: 'roof_rear',
      label: 'Rear roof',
      view: 'top',
      aliases: ['roof'],
    },
    {
      id: 'driver_roof_edge',
      label: 'Driver roof edge',
      view: 'top',
      aliases: ['driver_side', 'roof'],
      small: true,
    },
    {
      id: 'passenger_roof_edge',
      label: 'Passenger roof edge',
      view: 'top',
      aliases: ['passenger_side', 'roof'],
      small: true,
    },
    {
      id: 'driver_mirror',
      label: 'Driver mirror',
      view: 'top',
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'passenger_mirror',
      label: 'Passenger mirror',
      view: 'top',
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'rear_door_center_seam',
      label: 'Rear split-door boundary',
      view: 'top',
      aliases: ['rear_door', 'cargo_door'],
      small: true,
    },
    {
      id: 'rear_bumper',
      label: 'Rear bumper edge',
      view: 'top',
    },
  ],
}

export function getTransitViewRegions(configuration: TransitMapConfiguration) {
  const metadata = structuredClone(TRANSIT_REGION_METADATA) as Record<
    TransitView,
    TransitRegionMetadata[]
  >
  const driverIndex = metadata.driver.findIndex((region) => region.id === 'driver_cargo_panel')
  if (driverIndex >= 0 && ['driver', 'both'].includes(configuration.slidingDoor)) {
    metadata.driver[driverIndex] = DRIVER_SLIDING_DOOR_REGION
  }
  const passengerIndex = metadata.passenger.findIndex(
    (region) => region.id === 'passenger_sliding_door'
  )
  if (passengerIndex >= 0 && !['passenger', 'both'].includes(configuration.slidingDoor)) {
    metadata.passenger[passengerIndex] = PASSENGER_CARGO_PANEL_REGION
  }
  return buildPrecisionTransitRegions(metadata, configuration)
}

export const TRANSIT_VIEW_REGIONS = getTransitViewRegions(DEFAULT_TRANSIT_CONFIGURATION)

const ALL_TRANSIT_REGIONS = [
  ...TRANSIT_VIEW_ORDER.flatMap((view) => TRANSIT_VIEW_REGIONS[view]),
  DRIVER_SLIDING_DOOR_REGION,
  PASSENGER_CARGO_PANEL_REGION,
]
const REGION_BY_ID = new Map<string, TransitRegionMetadata>()
const REGION_ALIAS = new Map<string, TransitRegionMetadata>()

for (const region of ALL_TRANSIT_REGIONS) {
  if (!REGION_BY_ID.has(region.id)) REGION_BY_ID.set(region.id, region)
  for (const alias of region.aliases ?? []) {
    if (!REGION_ALIAS.has(alias)) REGION_ALIAS.set(alias, region)
  }
}

const REGION_REWRITES: Array<[RegExp, string]> = [
  [/\b(left|driver).*front.*bumper|front.*bumper.*(left|driver)\b/, 'front_bumper_driver'],
  [
    /\b(right|passenger).*front.*bumper|front.*bumper.*(right|passenger)\b/,
    'front_bumper_passenger',
  ],
  [/\b(left|driver).*rear.*bumper|rear.*bumper.*(left|driver)\b/, 'rear_bumper_driver'],
  [/\b(right|passenger).*rear.*bumper|rear.*bumper.*(right|passenger)\b/, 'rear_bumper_passenger'],
  [
    /\b(left|driver).*(headlight|headlamp)|(headlight|headlamp).*(left|driver)\b/,
    'driver_headlight',
  ],
  [
    /\b(right|passenger).*(headlight|headlamp)|(headlight|headlamp).*(right|passenger)\b/,
    'passenger_headlight',
  ],
  [/\b(left|driver).*mirror|mirror.*(left|driver)\b/, 'driver_mirror'],
  [/\b(right|passenger).*mirror|mirror.*(right|passenger)\b/, 'passenger_mirror'],
  [
    /\b(left|driver).*(sliding|slider).*door|(sliding|slider).*door.*(left|driver)\b/,
    'driver_sliding_door',
  ],
  [/\b(sliding|slider).*door|passenger.*cargo.*door\b/, 'passenger_sliding_door'],
  [/\b(left|driver).*rear.*door|rear.*door.*(left|driver)\b/, 'driver_rear_door'],
  [/\b(right|passenger).*rear.*door|rear.*door.*(right|passenger)\b/, 'passenger_rear_door'],
  [/\b(left|driver).*tail.*light|tail.*light.*(left|driver)\b/, 'driver_taillight'],
  [/\b(right|passenger).*tail.*light|tail.*light.*(right|passenger)\b/, 'passenger_taillight'],
  [
    /\b(left|driver).*front.*(wheel|tire)|(front.*(wheel|tire)).*(left|driver)\b/,
    'driver_front_wheel',
  ],
  [
    /\b(right|passenger).*front.*(wheel|tire)|(front.*(wheel|tire)).*(right|passenger)\b/,
    'passenger_front_wheel',
  ],
  [
    /\b(left|driver).*rear.*(wheel|tire)|(rear.*(wheel|tire)).*(left|driver)\b/,
    'driver_rear_wheel',
  ],
  [
    /\b(right|passenger).*rear.*(wheel|tire)|(rear.*(wheel|tire)).*(right|passenger)\b/,
    'passenger_rear_wheel',
  ],
  [/\bwindshield|windscreen\b/, 'windshield'],
  [/\bhood|bonnet\b/, 'hood'],
  [/\bfront.*bumper|bumper.*front\b/, 'front_bumper'],
  [/\brear.*bumper|back.*bumper|bumper.*rear\b/, 'rear_bumper'],
  [/\brear.*(door|panel)|cargo.*door|tailgate|liftgate\b/, 'driver_rear_door'],
  [/\broof.*front\b/, 'roof_front'],
  [/\broof.*rear\b/, 'roof_rear'],
  [/\broof\b/, 'roof_center'],
  [/\bdriver|left\b/, 'driver_cargo_panel'],
  [/\bpassenger|right\b/, 'passenger_sliding_door'],
  [/\bmirror\b/, 'driver_mirror'],
  [/\bwheel|tire\b/, 'driver_front_wheel'],
  [/\bdoor\b/, 'passenger_front_door'],
]

export function normalizeTransitRegion(value: string | null | undefined) {
  const normalized = normalizedText(value)
  if (!normalized || ['unknown', 'unspecified', 'interior'].includes(normalized)) return null
  const underscored = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (REGION_BY_ID.has(underscored)) return underscored
  if (REGION_ALIAS.has(underscored)) return REGION_ALIAS.get(underscored)!.id
  for (const [pattern, region] of REGION_REWRITES) {
    if (pattern.test(normalized)) return region
  }
  return null
}

export function resolveItemTransitRegion(item: {
  canonical_region?: string | null
  vehicle_area?: string | null
}) {
  return normalizeTransitRegion(item.canonical_region) ?? normalizeTransitRegion(item.vehicle_area)
}

export function getTransitRegionDefinition(
  regionId: string | null | undefined,
  preferredView?: TransitView
) {
  if (!regionId) return null
  const normalized = normalizeTransitRegion(regionId) ?? regionId
  if (preferredView) {
    const preferred = TRANSIT_VIEW_REGIONS[preferredView].find(
      (region) => region.id === normalized || region.aliases?.includes(normalized)
    )
    if (preferred) return preferred
  }
  return REGION_BY_ID.get(normalized) ?? REGION_ALIAS.get(normalized) ?? null
}

export function getTransitViewForRegion(regionId: string | null | undefined): TransitView {
  return getTransitRegionDefinition(regionId)?.view ?? 'passenger'
}

export function transitRegionMatches(
  selectedRegion: string,
  item: { canonical_region?: string | null; vehicle_area?: string | null }
) {
  const itemRegion = resolveItemTransitRegion(item)
  if (!itemRegion) return false
  if (itemRegion === selectedRegion) return true
  const selected = getTransitRegionDefinition(selectedRegion)
  const itemDefinition = getTransitRegionDefinition(itemRegion)
  return Boolean(
    selected?.aliases?.includes(itemRegion) ||
    itemDefinition?.aliases?.includes(selectedRegion) ||
    (selectedRegion === 'front_bumper' && itemRegion.startsWith('front_bumper')) ||
    (selectedRegion === 'rear_bumper' && itemRegion.startsWith('rear_bumper'))
  )
}

export function transitConfigurationLabel(configuration: TransitMapConfiguration) {
  return `${configuration.wheelbaseInches}-inch wheelbase · ${configuration.bodyLength} body · ${configuration.roofHeight} roof · ${configuration.rearWheels === 'single' ? 'SRW' : 'DRW'}`
}

export function buildTransitRegionAriaLabel(input: {
  label: string
  severity: string
  findingCount: number
  needsReview?: boolean
  confirmed?: boolean
  repaired?: boolean
  dismissed?: boolean
  selected?: boolean
}) {
  const state = input.repaired
    ? 'repaired'
    : input.dismissed
      ? 'dismissed'
      : input.findingCount
        ? `${input.severity} damage`
        : 'no mapped damage'
  return `${input.label}, ${state}, ${input.findingCount} ${input.findingCount === 1 ? 'finding' : 'findings'}${input.needsReview ? ', needs review' : ''}${input.confirmed ? ', human confirmed' : ''}${input.selected ? ', selected' : ''}`
}

export function classifyTransitRegionState(input: {
  findingCount: number
  severity: string
  needsReview?: boolean
  confirmed?: boolean
  repaired?: boolean
  dismissed?: boolean
  selected?: boolean
}) {
  if (!input.findingCount) return input.selected ? 'selected-empty' : 'empty'
  if (input.repaired) return 'repaired'
  if (input.dismissed) return 'dismissed'
  return `${input.severity || 'unknown'}${input.needsReview ? '-needs-review' : ''}${input.confirmed ? '-confirmed' : ''}${input.selected ? '-selected' : ''}`
}
