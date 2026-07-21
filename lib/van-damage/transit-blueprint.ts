export const TRANSIT_BLUEPRINT_ID = 'ford_transit_2019' as const
export const GENERIC_BLUEPRINT_ID = 'generic_vehicle' as const

export type VehicleBlueprintId = typeof TRANSIT_BLUEPRINT_ID | typeof GENERIC_BLUEPRINT_ID
export type TransitView = 'driver' | 'passenger' | 'front' | 'rear' | 'top'
export type TransitWheelbase = 'regular' | 'long' | 'extended'
export type TransitRoofHeight = 'low' | 'medium' | 'high'
export type TransitRearWheels = 'single' | 'dual'
export type TransitSlidingDoor = 'passenger' | 'driver' | 'both' | 'none'

export type TransitMapConfiguration = {
  wheelbase: TransitWheelbase
  roofHeight: TransitRoofHeight
  rearWheels: TransitRearWheels
  slidingDoor: TransitSlidingDoor
  cargoConfiguration: 'cargo' | 'passenger'
}

export type VehicleBlueprintInput = {
  make?: string | null
  model?: string | null
  year?: number | null
  metadata?: Record<string, unknown> | null
} | null

export type TransitRegionDefinition = {
  id: string
  label: string
  view: TransitView
  path: string
  labelX: number
  labelY: number
  aliases?: readonly string[]
  small?: boolean
}

export const DEFAULT_TRANSIT_CONFIGURATION: TransitMapConfiguration = {
  wheelbase: 'long',
  roofHeight: 'medium',
  rearWheels: 'single',
  slidingDoor: 'passenger',
  cargoConfiguration: 'cargo',
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
  }
  return ''
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

  return {
    wheelbase: wheelbaseText.includes('extended')
      ? 'extended'
      : wheelbaseText.includes('regular') || wheelbaseText.includes('short')
        ? 'regular'
        : 'long',
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

export const DRIVER_SLIDING_DOOR_REGION: TransitRegionDefinition = {
  id: 'driver_sliding_door',
  label: 'Driver sliding cargo door',
  view: 'driver',
  path: 'M394 76 L574 76 L574 267 L394 267 Z',
  labelX: 484,
  labelY: 168,
  aliases: [
    'driver_cargo_door',
    'left_sliding_door',
    'driver_cargo_panel',
    'driver_side',
    'left_side',
  ],
}

export const PASSENGER_CARGO_PANEL_REGION: TransitRegionDefinition = {
  id: 'passenger_cargo_panel',
  label: 'Passenger cargo panel',
  view: 'passenger',
  path: 'M394 70 L574 70 L574 267 L394 267 Z',
  labelX: 484,
  labelY: 168,
  aliases: ['passenger_side', 'right_side', 'side_panel'],
}

export const TRANSIT_VIEW_REGIONS: Record<TransitView, readonly TransitRegionDefinition[]> = {
  driver: [
    {
      id: 'front_bumper_driver',
      label: 'Driver front bumper corner',
      view: 'driver',
      path: 'M58 245 L116 239 L129 267 L116 288 L58 288 Z',
      labelX: 90,
      labelY: 268,
      aliases: ['driver_front_bumper', 'front_bumper'],
      small: true,
    },
    {
      id: 'driver_headlight',
      label: 'Driver headlight',
      view: 'driver',
      path: 'M103 201 L154 194 L159 215 L111 222 Z',
      labelX: 132,
      labelY: 208,
      aliases: ['headlight', 'front_light'],
      small: true,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'driver',
      path: 'M73 168 L202 158 L222 190 L154 200 L101 204 L66 192 Z',
      labelX: 145,
      labelY: 180,
    },
    {
      id: 'windshield',
      label: 'Windshield',
      view: 'driver',
      path: 'M201 73 L282 70 L274 173 L220 185 L196 151 Z',
      labelX: 242,
      labelY: 123,
    },
    {
      id: 'driver_mirror',
      label: 'Driver mirror',
      view: 'driver',
      path: 'M183 144 C164 136 151 141 149 153 C151 165 166 170 185 164 Z',
      labelX: 167,
      labelY: 153,
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'driver_front_fender',
      label: 'Driver front fender',
      view: 'driver',
      path: 'M125 217 L218 195 L249 217 L242 273 L206 273 C205 233 136 229 132 273 L116 267 Z',
      labelX: 185,
      labelY: 220,
    },
    {
      id: 'driver_front_door',
      label: 'Driver front door',
      view: 'driver',
      path: 'M282 72 L391 70 L391 267 L316 267 C313 222 273 211 243 232 L247 190 L274 173 Z',
      labelX: 338,
      labelY: 165,
      aliases: ['front_door', 'door'],
    },
    {
      id: 'driver_cargo_panel',
      label: 'Driver cargo panel',
      view: 'driver',
      path: 'M394 70 L560 70 L560 267 L394 267 Z',
      labelX: 477,
      labelY: 168,
      aliases: ['driver_side', 'left_side', 'side_panel'],
    },
    {
      id: 'driver_rear_cargo_panel',
      label: 'Driver rear cargo panel',
      view: 'driver',
      path: 'M563 70 L676 78 L704 111 L704 267 L640 267 C637 222 573 222 566 267 L563 267 Z',
      labelX: 624,
      labelY: 167,
      aliases: ['driver_rear_panel', 'rear_panel'],
    },
    {
      id: 'driver_rear_quarter',
      label: 'Driver rear quarter',
      view: 'driver',
      path: 'M676 78 L721 92 L733 130 L733 247 L704 267 L704 111 Z',
      labelX: 709,
      labelY: 174,
      aliases: ['rear_quarter'],
    },
    {
      id: 'driver_rocker_panel',
      label: 'Driver rocker panel',
      view: 'driver',
      path: 'M242 270 L566 270 L566 292 L242 292 Z',
      labelX: 405,
      labelY: 282,
      aliases: ['rocker_panel'],
      small: true,
    },
    {
      id: 'driver_front_wheel',
      label: 'Driver front wheel',
      view: 'driver',
      path: 'M132 273 A38 38 0 1 0 208 273 A38 38 0 1 0 132 273 Z',
      labelX: 170,
      labelY: 273,
      aliases: ['front_wheel', 'wheel'],
    },
    {
      id: 'driver_rear_wheel',
      label: 'Driver rear wheel',
      view: 'driver',
      path: 'M566 273 A38 38 0 1 0 642 273 A38 38 0 1 0 566 273 Z',
      labelX: 604,
      labelY: 273,
      aliases: ['rear_wheel', 'wheel'],
    },
    {
      id: 'rear_bumper_driver',
      label: 'Driver rear bumper corner',
      view: 'driver',
      path: 'M704 247 L750 247 L750 287 L702 287 Z',
      labelX: 726,
      labelY: 268,
      aliases: ['driver_rear_bumper', 'rear_bumper'],
      small: true,
    },
    {
      id: 'roof_front',
      label: 'Driver roof edge',
      view: 'driver',
      path: 'M199 49 Q206 37 230 34 L520 34 L560 52 L676 58 L676 78 L282 72 L201 73 Z',
      labelX: 430,
      labelY: 54,
      aliases: ['roof', 'driver_roof_edge'],
    },
  ],
  passenger: [
    {
      id: 'front_bumper_passenger',
      label: 'Passenger front bumper corner',
      view: 'passenger',
      path: 'M58 245 L116 239 L129 267 L116 288 L58 288 Z',
      labelX: 90,
      labelY: 268,
      aliases: ['passenger_front_bumper', 'front_bumper'],
      small: true,
    },
    {
      id: 'passenger_headlight',
      label: 'Passenger headlight',
      view: 'passenger',
      path: 'M103 201 L154 194 L159 215 L111 222 Z',
      labelX: 132,
      labelY: 208,
      aliases: ['headlight', 'front_light'],
      small: true,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'passenger',
      path: 'M73 168 L202 158 L222 190 L154 200 L101 204 L66 192 Z',
      labelX: 145,
      labelY: 180,
    },
    {
      id: 'windshield',
      label: 'Windshield',
      view: 'passenger',
      path: 'M201 73 L282 70 L274 173 L220 185 L196 151 Z',
      labelX: 242,
      labelY: 123,
    },
    {
      id: 'passenger_mirror',
      label: 'Passenger mirror',
      view: 'passenger',
      path: 'M183 144 C164 136 151 141 149 153 C151 165 166 170 185 164 Z',
      labelX: 167,
      labelY: 153,
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'passenger_front_fender',
      label: 'Passenger front fender',
      view: 'passenger',
      path: 'M125 217 L218 195 L249 217 L242 273 L206 273 C205 233 136 229 132 273 L116 267 Z',
      labelX: 185,
      labelY: 220,
    },
    {
      id: 'passenger_front_door',
      label: 'Passenger front door',
      view: 'passenger',
      path: 'M282 72 L391 70 L391 267 L316 267 C313 222 273 211 243 232 L247 190 L274 173 Z',
      labelX: 338,
      labelY: 165,
      aliases: ['front_door', 'door'],
    },
    {
      id: 'passenger_sliding_door',
      label: 'Passenger sliding cargo door',
      view: 'passenger',
      path: 'M394 76 L574 76 L574 267 L394 267 Z',
      labelX: 484,
      labelY: 168,
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
      path: 'M578 76 L676 78 L704 111 L704 267 L640 267 C637 222 579 222 574 267 L578 267 Z',
      labelX: 628,
      labelY: 166,
      aliases: ['passenger_rear_panel', 'rear_panel'],
    },
    {
      id: 'passenger_rear_quarter',
      label: 'Passenger rear quarter',
      view: 'passenger',
      path: 'M676 78 L721 92 L733 130 L733 247 L704 267 L704 111 Z',
      labelX: 709,
      labelY: 174,
      aliases: ['rear_quarter'],
    },
    {
      id: 'passenger_rocker_panel',
      label: 'Passenger rocker panel',
      view: 'passenger',
      path: 'M242 270 L574 270 L574 292 L242 292 Z',
      labelX: 408,
      labelY: 282,
      aliases: ['rocker_panel'],
      small: true,
    },
    {
      id: 'passenger_front_wheel',
      label: 'Passenger front wheel',
      view: 'passenger',
      path: 'M132 273 A38 38 0 1 0 208 273 A38 38 0 1 0 132 273 Z',
      labelX: 170,
      labelY: 273,
      aliases: ['front_wheel', 'wheel'],
    },
    {
      id: 'passenger_rear_wheel',
      label: 'Passenger rear wheel',
      view: 'passenger',
      path: 'M566 273 A38 38 0 1 0 642 273 A38 38 0 1 0 566 273 Z',
      labelX: 604,
      labelY: 273,
      aliases: ['rear_wheel', 'wheel'],
    },
    {
      id: 'rear_bumper_passenger',
      label: 'Passenger rear bumper corner',
      view: 'passenger',
      path: 'M704 247 L750 247 L750 287 L702 287 Z',
      labelX: 726,
      labelY: 268,
      aliases: ['passenger_rear_bumper', 'rear_bumper'],
      small: true,
    },
    {
      id: 'roof_front',
      label: 'Passenger roof edge',
      view: 'passenger',
      path: 'M199 49 Q206 37 230 34 L520 34 L560 52 L676 58 L676 78 L282 72 L201 73 Z',
      labelX: 430,
      labelY: 54,
      aliases: ['roof', 'passenger_roof_edge'],
    },
  ],
  front: [
    {
      id: 'roof_front',
      label: 'Front roof section',
      view: 'front',
      path: 'M251 42 Q263 22 300 18 L500 18 Q537 22 549 42 L565 75 L235 75 Z',
      labelX: 400,
      labelY: 47,
      aliases: ['roof'],
    },
    {
      id: 'windshield',
      label: 'Windshield',
      view: 'front',
      path: 'M259 79 L541 79 L520 169 L280 169 Z',
      labelX: 400,
      labelY: 122,
    },
    {
      id: 'driver_mirror',
      label: 'Driver mirror',
      view: 'front',
      path: 'M205 108 Q174 104 164 121 L174 150 Q194 152 220 135 Z',
      labelX: 190,
      labelY: 129,
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'passenger_mirror',
      label: 'Passenger mirror',
      view: 'front',
      path: 'M595 108 Q626 104 636 121 L626 150 Q606 152 580 135 Z',
      labelX: 610,
      labelY: 129,
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'front',
      path: 'M281 174 L519 174 L550 217 L250 217 Z',
      labelX: 400,
      labelY: 195,
    },
    {
      id: 'driver_headlight',
      label: 'Driver headlight',
      view: 'front',
      path: 'M247 188 L315 183 L329 220 L252 225 Z',
      labelX: 286,
      labelY: 205,
      aliases: ['headlight'],
      small: true,
    },
    {
      id: 'passenger_headlight',
      label: 'Passenger headlight',
      view: 'front',
      path: 'M553 188 L485 183 L471 220 L548 225 Z',
      labelX: 514,
      labelY: 205,
      aliases: ['headlight'],
      small: true,
    },
    {
      id: 'driver_front_fender',
      label: 'Driver front fender edge',
      view: 'front',
      path: 'M217 168 L281 174 L250 244 L210 257 Z',
      labelX: 239,
      labelY: 214,
    },
    {
      id: 'passenger_front_fender',
      label: 'Passenger front fender edge',
      view: 'front',
      path: 'M583 168 L519 174 L550 244 L590 257 Z',
      labelX: 561,
      labelY: 214,
    },
    {
      id: 'upper_grille',
      label: 'Upper grille',
      view: 'front',
      path: 'M330 190 L470 190 L459 224 L341 224 Z',
      labelX: 400,
      labelY: 207,
      aliases: ['grille'],
      small: true,
    },
    {
      id: 'lower_grille',
      label: 'Lower grille',
      view: 'front',
      path: 'M302 231 L498 231 L479 278 L321 278 Z',
      labelX: 400,
      labelY: 255,
      aliases: ['grille', 'front_center'],
    },
    {
      id: 'front_bumper_driver',
      label: 'Driver front bumper corner',
      view: 'front',
      path: 'M205 259 L321 244 L321 294 L207 294 Z',
      labelX: 263,
      labelY: 277,
      aliases: ['driver_front_bumper', 'front_bumper'],
    },
    {
      id: 'front_bumper',
      label: 'Front bumper center',
      view: 'front',
      path: 'M321 278 L479 278 L488 304 L312 304 Z',
      labelX: 400,
      labelY: 292,
    },
    {
      id: 'front_bumper_passenger',
      label: 'Passenger front bumper corner',
      view: 'front',
      path: 'M595 259 L479 244 L479 294 L593 294 Z',
      labelX: 537,
      labelY: 277,
      aliases: ['passenger_front_bumper', 'front_bumper'],
    },
  ],
  rear: [
    {
      id: 'roof_rear',
      label: 'Rear roof section',
      view: 'rear',
      path: 'M239 49 Q250 24 286 20 L514 20 Q550 24 561 49 L568 72 L232 72 Z',
      labelX: 400,
      labelY: 48,
      aliases: ['roof'],
    },
    {
      id: 'driver_rear_door',
      label: 'Driver split rear door',
      view: 'rear',
      path: 'M244 77 L396 77 L396 283 L244 283 Z',
      labelX: 320,
      labelY: 178,
      aliases: ['left_rear_door', 'rear_door', 'cargo_door', 'tailgate', 'liftgate', 'rear_panel'],
    },
    {
      id: 'passenger_rear_door',
      label: 'Passenger split rear door',
      view: 'rear',
      path: 'M404 77 L556 77 L556 283 L404 283 Z',
      labelX: 480,
      labelY: 178,
      aliases: ['right_rear_door', 'rear_door', 'cargo_door', 'tailgate', 'liftgate', 'rear_panel'],
    },
    {
      id: 'rear_door_center_seam',
      label: 'Rear-door center seam',
      view: 'rear',
      path: 'M394 76 L406 76 L406 286 L394 286 Z',
      labelX: 400,
      labelY: 182,
      aliases: ['rear_door_seam'],
      small: true,
    },
    {
      id: 'driver_taillight',
      label: 'Driver taillight',
      view: 'rear',
      path: 'M222 94 L244 90 L244 230 L218 224 Z',
      labelX: 232,
      labelY: 160,
      aliases: ['left_taillight', 'taillight'],
      small: true,
    },
    {
      id: 'passenger_taillight',
      label: 'Passenger taillight',
      view: 'rear',
      path: 'M578 94 L556 90 L556 230 L582 224 Z',
      labelX: 568,
      labelY: 160,
      aliases: ['right_taillight', 'taillight'],
      small: true,
    },
    {
      id: 'driver_rear_lower_door',
      label: 'Driver rear lower door',
      view: 'rear',
      path: 'M246 222 L394 222 L394 282 L246 282 Z',
      labelX: 320,
      labelY: 252,
      aliases: ['rear_lower_panel'],
    },
    {
      id: 'passenger_rear_lower_door',
      label: 'Passenger rear lower door',
      view: 'rear',
      path: 'M406 222 L554 222 L554 282 L406 282 Z',
      labelX: 480,
      labelY: 252,
      aliases: ['rear_lower_panel'],
    },
    {
      id: 'rear_bumper_driver',
      label: 'Driver rear bumper corner',
      view: 'rear',
      path: 'M202 276 L315 276 L315 313 L205 313 Z',
      labelX: 258,
      labelY: 295,
      aliases: ['driver_rear_bumper', 'rear_bumper'],
    },
    {
      id: 'rear_bumper',
      label: 'Rear bumper center',
      view: 'rear',
      path: 'M315 282 L485 282 L485 318 L315 318 Z',
      labelX: 400,
      labelY: 300,
    },
    {
      id: 'rear_bumper_passenger',
      label: 'Passenger rear bumper corner',
      view: 'rear',
      path: 'M485 276 L598 276 L595 313 L485 313 Z',
      labelX: 542,
      labelY: 295,
      aliases: ['passenger_rear_bumper', 'rear_bumper'],
    },
  ],
  top: [
    {
      id: 'front_bumper',
      label: 'Front bumper edge',
      view: 'top',
      path: 'M52 125 Q42 180 52 235 L87 235 L87 125 Z',
      labelX: 70,
      labelY: 180,
    },
    {
      id: 'hood',
      label: 'Hood',
      view: 'top',
      path: 'M90 125 L214 137 L214 223 L90 235 Q78 180 90 125 Z',
      labelX: 151,
      labelY: 180,
    },
    {
      id: 'windshield',
      label: 'Windshield boundary',
      view: 'top',
      path: 'M218 136 L268 113 L268 247 L218 224 Z',
      labelX: 244,
      labelY: 180,
      small: true,
    },
    {
      id: 'roof_front',
      label: 'Front roof',
      view: 'top',
      path: 'M272 96 L410 86 L410 274 L272 264 Z',
      labelX: 341,
      labelY: 180,
      aliases: ['roof'],
    },
    {
      id: 'roof_center',
      label: 'Center roof',
      view: 'top',
      path: 'M414 86 L566 86 L566 274 L414 274 Z',
      labelX: 490,
      labelY: 180,
      aliases: ['roof'],
    },
    {
      id: 'roof_rear',
      label: 'Rear roof',
      view: 'top',
      path: 'M570 86 L700 98 L700 262 L570 274 Z',
      labelX: 635,
      labelY: 180,
      aliases: ['roof'],
    },
    {
      id: 'driver_roof_edge',
      label: 'Driver roof edge',
      view: 'top',
      path: 'M272 75 L700 86 L700 99 L272 96 Z',
      labelX: 486,
      labelY: 88,
      aliases: ['driver_side', 'roof'],
      small: true,
    },
    {
      id: 'passenger_roof_edge',
      label: 'Passenger roof edge',
      view: 'top',
      path: 'M272 264 L700 261 L700 275 L272 285 Z',
      labelX: 486,
      labelY: 273,
      aliases: ['passenger_side', 'roof'],
      small: true,
    },
    {
      id: 'driver_mirror',
      label: 'Driver mirror',
      view: 'top',
      path: 'M198 106 Q209 83 232 88 L244 116 L219 129 Z',
      labelX: 221,
      labelY: 106,
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'passenger_mirror',
      label: 'Passenger mirror',
      view: 'top',
      path: 'M198 254 Q209 277 232 272 L244 244 L219 231 Z',
      labelX: 221,
      labelY: 254,
      aliases: ['mirror'],
      small: true,
    },
    {
      id: 'rear_door_center_seam',
      label: 'Rear split-door boundary',
      view: 'top',
      path: 'M701 98 L716 105 L716 255 L701 262 Z',
      labelX: 708,
      labelY: 180,
      aliases: ['rear_door', 'cargo_door'],
      small: true,
    },
    {
      id: 'rear_bumper',
      label: 'Rear bumper edge',
      view: 'top',
      path: 'M716 108 L744 118 L744 242 L716 252 Z',
      labelX: 730,
      labelY: 180,
    },
  ],
}

const ALL_TRANSIT_REGIONS = [
  ...TRANSIT_VIEW_ORDER.flatMap((view) => TRANSIT_VIEW_REGIONS[view]),
  DRIVER_SLIDING_DOOR_REGION,
  PASSENGER_CARGO_PANEL_REGION,
]
const REGION_BY_ID = new Map<string, TransitRegionDefinition>()
const REGION_ALIAS = new Map<string, TransitRegionDefinition>()

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
  return `${configuration.wheelbase} wheelbase · ${configuration.roofHeight} roof · ${configuration.rearWheels} rear wheel`
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
