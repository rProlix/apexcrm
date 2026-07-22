import type {
  TransitMapConfiguration,
  TransitRegionDefinition,
  TransitRegionMetadata,
  TransitView,
} from './transit-blueprint'

export const TRANSIT_SVG_VIEWBOX = { width: 800, height: 400 } as const

export const TRANSIT_REFERENCE_DIMENSIONS = {
  wheelbase130: 129.9,
  wheelbase148: 147.6,
  regular130LowLength: 219.9,
  regular130MediumLength: 217.8,
  regular148LowLength: 237.6,
  regular148Length: 235.5,
  extended148Length: 263.9,
  frontOverhang: 40.3,
  regularRearOverhang: 47.6,
  extendedRearOverhang: 76,
  bodyWidth: 81.3,
  dualRearWheelBodyWidth: 83.7,
  mirrorWidth: 97.4,
  lowRoofHeight: 83.2,
  mediumRoofHeight: 100.7,
  highRoofHeight: 110.1,
  tireDiameter: 28,
  slidingDoorOpeningWidth: 51.2,
  slidingDoorOpeningHeight: 63,
} as const

export type TransitPoint = { x: number; y: number }

export type TransitGeometry = {
  viewBox: typeof TRANSIT_SVG_VIEWBOX
  dimensions: {
    wheelbase: number
    overallLength: number
    frontOverhang: number
    rearOverhang: number
    bodyWidth: number
    mirrorWidth: number
    roofHeight: number
    tireDiameter: number
  }
  side: {
    scale: number
    frontEdge: number
    frontAxle: number
    rearAxle: number
    rearEdge: number
    roofY: number
    groundY: number
    bodyBottomY: number
    wheelRadius: number
    beltlineY: number
    hoodFront: TransitPoint
    hoodRear: TransitPoint
    windshieldTop: TransitPoint
    windshieldBase: TransitPoint
    cabRearX: number
    cargoDoorRearX: number
    rearDoorSeamX: number
  }
  end: {
    centerX: number
    bodyLeft: number
    bodyRight: number
    mirrorLeft: number
    mirrorRight: number
    roofY: number
    beltlineY: number
    bodyBottomY: number
    bumperBottomY: number
  }
  top: {
    frontEdge: number
    rearEdge: number
    bodyTop: number
    bodyBottom: number
    centerY: number
    windshieldX: number
    cabRearX: number
    cargoRearX: number
    mirrorTop: number
    mirrorBottom: number
  }
  landmarks: ReadonlyArray<{ name: string; point: TransitPoint }>
}

const n = (value: number) => Math.round(value * 10) / 10
const rect = (x1: number, y1: number, x2: number, y2: number, radius = 0) =>
  radius
    ? `M${n(x1 + radius)} ${n(y1)} H${n(x2 - radius)} Q${n(x2)} ${n(y1)} ${n(x2)} ${n(y1 + radius)} V${n(y2 - radius)} Q${n(x2)} ${n(y2)} ${n(x2 - radius)} ${n(y2)} H${n(x1 + radius)} Q${n(x1)} ${n(y2)} ${n(x1)} ${n(y2 - radius)} V${n(y1 + radius)} Q${n(x1)} ${n(y1)} ${n(x1 + radius)} ${n(y1)} Z`
    : `M${n(x1)} ${n(y1)} H${n(x2)} V${n(y2)} H${n(x1)} Z`
const polygon = (...points: TransitPoint[]) =>
  `${points.map((point, index) => `${index ? 'L' : 'M'}${n(point.x)} ${n(point.y)}`).join(' ')} Z`
const ellipse = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${n(cx - rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)} Z`

export function createTransitGeometry(configuration: TransitMapConfiguration): TransitGeometry {
  const wheelbase = configuration.wheelbaseInches === 130 ? 129.9 : 147.6
  const extended = configuration.bodyLength === 'extended' && configuration.wheelbaseInches === 148
  const overallLength = extended
    ? TRANSIT_REFERENCE_DIMENSIONS.extended148Length
    : configuration.wheelbaseInches === 130
      ? configuration.roofHeight === 'low'
        ? TRANSIT_REFERENCE_DIMENSIONS.regular130LowLength
        : TRANSIT_REFERENCE_DIMENSIONS.regular130MediumLength
      : configuration.roofHeight === 'low'
        ? TRANSIT_REFERENCE_DIMENSIONS.regular148LowLength
        : TRANSIT_REFERENCE_DIMENSIONS.regular148Length
  const frontOverhang = 40.3
  const rearOverhang = overallLength - wheelbase - frontOverhang
  const roofHeight =
    configuration.roofHeight === 'low'
      ? configuration.wheelbaseInches === 130
        ? 83.6
        : TRANSIT_REFERENCE_DIMENSIONS.lowRoofHeight
      : configuration.roofHeight === 'high'
        ? extended
          ? 109.4
          : TRANSIT_REFERENCE_DIMENSIONS.highRoofHeight
        : configuration.wheelbaseInches === 130
          ? 100.8
          : TRANSIT_REFERENCE_DIMENSIONS.mediumRoofHeight
  const bodyWidth =
    configuration.rearWheels === 'dual'
      ? TRANSIT_REFERENCE_DIMENSIONS.dualRearWheelBodyWidth
      : TRANSIT_REFERENCE_DIMENSIONS.bodyWidth
  const scale = 692 / overallLength
  const frontEdge = 54
  const groundY = 348
  const rearEdge = frontEdge + overallLength * scale
  const frontAxle = frontEdge + frontOverhang * scale
  const rearAxle = frontAxle + wheelbase * scale
  const roofY = groundY - roofHeight * scale
  const bodyBottomY = groundY - 8.7 * scale
  const wheelRadius = (TRANSIT_REFERENCE_DIMENSIONS.tireDiameter * scale) / 2
  const beltlineY = roofY + (bodyBottomY - roofY) * 0.43
  const windshieldTop = { x: frontAxle + wheelbase * scale * 0.105, y: roofY + 12 }
  const windshieldBase = { x: frontAxle + wheelbase * scale * 0.245, y: beltlineY + 18 }
  const hoodRear = { x: windshieldBase.x - 7, y: windshieldBase.y + 2 }
  const hoodFront = { x: frontEdge + 17, y: beltlineY + 44 }
  const cabRearX = frontAxle + wheelbase * scale * 0.5
  const cargoDoorRearX = rearAxle - wheelbase * scale * 0.08
  const rearDoorSeamX = rearEdge - Math.min(31, rearOverhang * scale * 0.24)

  const endScale = 3.08
  const bodyWidthPx = bodyWidth * endScale
  const mirrorWidthPx = TRANSIT_REFERENCE_DIMENSIONS.mirrorWidth * endScale
  const centerX = 400
  const endRoofY =
    configuration.roofHeight === 'low' ? 89 : configuration.roofHeight === 'high' ? 31 : 54
  const end = {
    centerX,
    bodyLeft: centerX - bodyWidthPx / 2,
    bodyRight: centerX + bodyWidthPx / 2,
    mirrorLeft: centerX - mirrorWidthPx / 2,
    mirrorRight: centerX + mirrorWidthPx / 2,
    roofY: endRoofY,
    beltlineY: 176,
    bodyBottomY: 329,
    bumperBottomY: 351,
  }
  const halfBody = (bodyWidth * scale) / 2
  const halfMirror = (TRANSIT_REFERENCE_DIMENSIONS.mirrorWidth * scale) / 2
  const top = {
    frontEdge,
    rearEdge,
    bodyTop: 200 - halfBody,
    bodyBottom: 200 + halfBody,
    centerY: 200,
    windshieldX: frontAxle + wheelbase * scale * 0.19,
    cabRearX,
    cargoRearX: rearDoorSeamX,
    mirrorTop: 200 - halfMirror,
    mirrorBottom: 200 + halfMirror,
  }
  const side = {
    scale,
    frontEdge,
    frontAxle,
    rearAxle,
    rearEdge,
    roofY,
    groundY,
    bodyBottomY,
    wheelRadius,
    beltlineY,
    hoodFront,
    hoodRear,
    windshieldTop,
    windshieldBase,
    cabRearX,
    cargoDoorRearX,
    rearDoorSeamX,
  }
  return {
    viewBox: TRANSIT_SVG_VIEWBOX,
    dimensions: {
      wheelbase,
      overallLength,
      frontOverhang,
      rearOverhang,
      bodyWidth,
      mirrorWidth: TRANSIT_REFERENCE_DIMENSIONS.mirrorWidth,
      roofHeight,
      tireDiameter: TRANSIT_REFERENCE_DIMENSIONS.tireDiameter,
    },
    side,
    end,
    top,
    landmarks: [
      { name: 'front edge', point: { x: frontEdge, y: bodyBottomY } },
      { name: 'front axle', point: { x: frontAxle, y: groundY - wheelRadius } },
      { name: 'rear axle', point: { x: rearAxle, y: groundY - wheelRadius } },
      { name: 'rear edge', point: { x: rearEdge, y: bodyBottomY } },
      { name: 'roof datum', point: { x: cabRearX, y: roofY } },
      { name: 'windshield base', point: windshieldBase },
      { name: 'cab/cargo boundary', point: { x: cabRearX, y: beltlineY } },
      { name: 'rear-door seam', point: { x: rearDoorSeamX, y: beltlineY } },
    ],
  }
}

function sideRegionPath(id: string, geometry: TransitGeometry) {
  const s = geometry.side
  const wheelY = s.groundY - s.wheelRadius
  const side = id.startsWith('passenger_') ? 'passenger' : 'driver'
  const frontBumperId = id === `front_bumper_${side}`
  const rearBumperId = id === `rear_bumper_${side}`
  if (frontBumperId)
    return polygon(
      { x: s.frontEdge, y: s.hoodFront.y + 18 },
      { x: s.frontAxle - s.wheelRadius - 10, y: s.hoodFront.y + 25 },
      { x: s.frontAxle - s.wheelRadius - 4, y: s.bodyBottomY },
      { x: s.frontEdge, y: s.bodyBottomY }
    )
  if (rearBumperId)
    return rect(
      s.rearAxle + s.wheelRadius + 5,
      s.bodyBottomY - 16,
      s.rearEdge + 5,
      s.bodyBottomY + 7
    )
  if (id.endsWith('_headlight'))
    return polygon(
      { x: s.frontEdge + 41, y: s.hoodFront.y + 1 },
      { x: s.frontEdge + 91, y: s.hoodFront.y - 9 },
      { x: s.frontEdge + 95, y: s.hoodFront.y + 13 },
      { x: s.frontEdge + 47, y: s.hoodFront.y + 20 }
    )
  if (id === 'hood')
    return polygon(
      s.hoodFront,
      s.hoodRear,
      { x: s.windshieldBase.x - 2, y: s.windshieldBase.y + 22 },
      { x: s.frontEdge + 12, y: s.hoodFront.y + 25 }
    )
  if (id === 'windshield')
    return polygon(
      s.windshieldTop,
      { x: s.windshieldTop.x + 75, y: s.roofY + 11 },
      s.windshieldBase,
      { x: s.windshieldBase.x - 20, y: s.windshieldBase.y - 25 }
    )
  if (id.endsWith('_mirror')) return ellipse(s.windshieldBase.x - 47, s.beltlineY + 16, 20, 11)
  if (id.endsWith('_front_fender'))
    return `M${n(s.frontEdge + 66)} ${n(s.hoodFront.y + 21)} L${n(s.windshieldBase.x)} ${n(s.windshieldBase.y + 25)} L${n(s.windshieldBase.x)} ${n(s.bodyBottomY)} H${n(s.frontAxle + s.wheelRadius)} A${n(s.wheelRadius)} ${n(s.wheelRadius)} 0 0 0 ${n(s.frontAxle - s.wheelRadius)} ${n(s.bodyBottomY)} H${n(s.frontEdge + 56)} Z`
  if (id.endsWith('_front_door'))
    return polygon(
      { x: s.windshieldTop.x + 76, y: s.roofY + 10 },
      { x: s.cabRearX, y: s.roofY + 10 },
      { x: s.cabRearX, y: s.bodyBottomY },
      { x: s.frontAxle + s.wheelRadius, y: s.bodyBottomY },
      { x: s.windshieldBase.x, y: s.windshieldBase.y }
    )
  if (id.endsWith('_front_wheel')) return ellipse(s.frontAxle, wheelY, s.wheelRadius)
  if (id.endsWith('_rear_wheel')) return ellipse(s.rearAxle, wheelY, s.wheelRadius)
  if (id.endsWith('_rocker_panel'))
    return rect(
      s.frontAxle + s.wheelRadius,
      s.bodyBottomY - 20,
      s.rearAxle - s.wheelRadius,
      s.bodyBottomY
    )
  if (id === 'roof_front') return rect(s.windshieldTop.x, s.roofY, s.cabRearX, s.roofY + 18)
  if (id.includes('rear_quarter'))
    return `M${n(s.cargoDoorRearX)} ${n(s.beltlineY)} H${n(s.rearEdge)} V${n(s.bodyBottomY)} H${n(s.rearAxle + s.wheelRadius)} A${n(s.wheelRadius)} ${n(s.wheelRadius)} 0 0 0 ${n(s.rearAxle - s.wheelRadius)} ${n(s.bodyBottomY)} H${n(s.cargoDoorRearX)} Z`
  if (id.includes('rear_cargo_panel'))
    return rect(s.cargoDoorRearX, s.roofY + 13, s.rearDoorSeamX, s.bodyBottomY - 24)
  if (id.includes('sliding_door') || id.includes('cargo_panel'))
    return rect(s.cabRearX + 4, s.roofY + 15, s.cargoDoorRearX, s.bodyBottomY - 24, 2)
  return rect(s.cabRearX, s.roofY + 15, s.cargoDoorRearX, s.bodyBottomY - 24)
}

function frontRegionPath(id: string, geometry: TransitGeometry) {
  const e = geometry.end
  const c = e.centerX
  if (id === 'roof_front')
    return polygon(
      { x: e.bodyLeft + 34, y: e.roofY + 3 },
      { x: e.bodyRight - 34, y: e.roofY + 3 },
      { x: e.bodyRight - 18, y: e.roofY + 27 },
      { x: e.bodyLeft + 18, y: e.roofY + 27 }
    )
  if (id === 'windshield')
    return polygon(
      { x: e.bodyLeft + 25, y: e.roofY + 31 },
      { x: e.bodyRight - 25, y: e.roofY + 31 },
      { x: e.bodyRight - 46, y: e.beltlineY - 8 },
      { x: e.bodyLeft + 46, y: e.beltlineY - 8 }
    )
  if (id === 'hood')
    return polygon(
      { x: e.bodyLeft + 47, y: e.beltlineY - 3 },
      { x: e.bodyRight - 47, y: e.beltlineY - 3 },
      { x: e.bodyRight - 29, y: e.beltlineY + 35 },
      { x: e.bodyLeft + 29, y: e.beltlineY + 35 }
    )
  if (id === 'driver_mirror') return ellipse(e.mirrorLeft + 12, e.beltlineY - 2, 18, 12)
  if (id === 'passenger_mirror') return ellipse(e.mirrorRight - 12, e.beltlineY - 2, 18, 12)
  if (id === 'driver_headlight')
    return polygon(
      { x: e.bodyLeft + 8, y: e.beltlineY + 40 },
      { x: c - 61, y: e.beltlineY + 28 },
      { x: c - 69, y: e.beltlineY + 57 },
      { x: e.bodyLeft + 17, y: e.beltlineY + 64 }
    )
  if (id === 'passenger_headlight')
    return polygon(
      { x: e.bodyRight - 8, y: e.beltlineY + 40 },
      { x: c + 61, y: e.beltlineY + 28 },
      { x: c + 69, y: e.beltlineY + 57 },
      { x: e.bodyRight - 17, y: e.beltlineY + 64 }
    )
  if (id === 'driver_front_fender')
    return rect(e.bodyLeft, e.beltlineY + 66, c - 93, e.bodyBottomY - 14)
  if (id === 'passenger_front_fender')
    return rect(c + 93, e.beltlineY + 66, e.bodyRight, e.bodyBottomY - 14)
  if (id === 'upper_grille')
    return polygon(
      { x: c - 62, y: e.beltlineY + 30 },
      { x: c + 62, y: e.beltlineY + 30 },
      { x: c + 53, y: e.beltlineY + 64 },
      { x: c - 53, y: e.beltlineY + 64 }
    )
  if (id === 'lower_grille')
    return polygon(
      { x: c - 85, y: e.beltlineY + 75 },
      { x: c + 85, y: e.beltlineY + 75 },
      { x: c + 66, y: e.bodyBottomY - 10 },
      { x: c - 66, y: e.bodyBottomY - 10 }
    )
  if (id === 'front_bumper_driver')
    return rect(e.bodyLeft - 5, e.bodyBottomY - 38, c - 82, e.bumperBottomY)
  if (id === 'front_bumper_passenger')
    return rect(c + 82, e.bodyBottomY - 38, e.bodyRight + 5, e.bumperBottomY)
  return rect(c - 82, e.bodyBottomY - 30, c + 82, e.bumperBottomY)
}

function rearRegionPath(id: string, geometry: TransitGeometry) {
  const e = geometry.end
  const c = e.centerX
  const doorTop = e.roofY + 29
  const doorBottom = e.bodyBottomY - 35
  if (id === 'roof_rear') return rect(e.bodyLeft + 18, e.roofY, e.bodyRight - 18, doorTop + 14)
  if (id === 'driver_rear_door') return rect(e.bodyLeft + 22, doorTop, c - 6, doorBottom)
  if (id === 'passenger_rear_door') return rect(c + 6, doorTop, e.bodyRight - 22, doorBottom)
  if (id === 'rear_door_center_seam') return rect(c - 7, doorTop, c + 7, doorBottom, 3)
  if (id === 'driver_taillight')
    return rect(e.bodyLeft - 3, e.beltlineY - 45, e.bodyLeft + 20, e.bodyBottomY - 62, 7)
  if (id === 'passenger_taillight')
    return rect(e.bodyRight - 20, e.beltlineY - 45, e.bodyRight + 3, e.bodyBottomY - 62, 7)
  if (id === 'driver_rear_lower_door')
    return rect(e.bodyLeft + 22, doorBottom, c - 6, e.bodyBottomY)
  if (id === 'passenger_rear_lower_door')
    return rect(c + 6, doorBottom, e.bodyRight - 22, e.bodyBottomY)
  if (id === 'rear_bumper_driver')
    return rect(e.bodyLeft - 7, e.bodyBottomY, c - 80, e.bumperBottomY)
  if (id === 'rear_bumper_passenger')
    return rect(c + 80, e.bodyBottomY, e.bodyRight + 7, e.bumperBottomY)
  return rect(c - 80, e.bodyBottomY, c + 80, e.bumperBottomY)
}

function topRegionPath(id: string, geometry: TransitGeometry) {
  const t = geometry.top
  const edge = 19
  if (id === 'front_bumper')
    return rect(t.frontEdge - 5, t.bodyTop + 42, t.frontEdge + 25, t.bodyBottom - 42)
  if (id === 'hood')
    return polygon(
      { x: t.frontEdge + 22, y: t.bodyTop + 29 },
      { x: t.windshieldX - 12, y: t.bodyTop + 14 },
      { x: t.windshieldX - 12, y: t.bodyBottom - 14 },
      { x: t.frontEdge + 22, y: t.bodyBottom - 29 }
    )
  if (id === 'windshield')
    return polygon(
      { x: t.windshieldX - 12, y: t.bodyTop + 14 },
      { x: t.windshieldX + 34, y: t.bodyTop },
      { x: t.windshieldX + 34, y: t.bodyBottom },
      { x: t.windshieldX - 12, y: t.bodyBottom - 14 }
    )
  if (id === 'roof_front') return rect(t.windshieldX + 34, t.bodyTop, t.cabRearX, t.bodyBottom)
  if (id === 'roof_center') return rect(t.cabRearX, t.bodyTop, t.cargoRearX - 80, t.bodyBottom)
  if (id === 'roof_rear') return rect(t.cargoRearX - 80, t.bodyTop, t.cargoRearX, t.bodyBottom)
  if (id === 'driver_roof_edge')
    return rect(t.windshieldX + 34, t.bodyTop - 7, t.cargoRearX, t.bodyTop + edge)
  if (id === 'passenger_roof_edge')
    return rect(t.windshieldX + 34, t.bodyBottom - edge, t.cargoRearX, t.bodyBottom + 7)
  if (id === 'driver_mirror') return ellipse(t.windshieldX - 17, t.mirrorTop + 12, 17, 10)
  if (id === 'passenger_mirror') return ellipse(t.windshieldX - 17, t.mirrorBottom - 12, 17, 10)
  if (id === 'rear_door_center_seam')
    return rect(t.cargoRearX, t.bodyTop, t.rearEdge - 8, t.bodyBottom)
  return rect(t.rearEdge - 8, t.bodyTop + 20, t.rearEdge + 12, t.bodyBottom - 20)
}

export function buildPrecisionTransitRegions(
  metadata: Record<TransitView, readonly TransitRegionMetadata[]>,
  configuration: TransitMapConfiguration
) {
  const geometry = createTransitGeometry(configuration)
  return Object.fromEntries(
    (Object.keys(metadata) as TransitView[]).map((view) => [
      view,
      metadata[view].map((region) => {
        const path =
          view === 'driver' || view === 'passenger'
            ? sideRegionPath(region.id, geometry)
            : view === 'front'
              ? frontRegionPath(region.id, geometry)
              : view === 'rear'
                ? rearRegionPath(region.id, geometry)
                : topRegionPath(region.id, geometry)
        const point = regionLabelPoint(region.id, view, geometry)
        return { ...region, path, labelX: point.x, labelY: point.y }
      }),
    ])
  ) as unknown as Record<TransitView, readonly TransitRegionDefinition[]>
}

function regionLabelPoint(id: string, view: TransitView, g: TransitGeometry): TransitPoint {
  if (view === 'driver' || view === 'passenger') {
    const s = g.side
    if (id.endsWith('_front_wheel')) return { x: s.frontAxle, y: s.groundY - s.wheelRadius }
    if (id.endsWith('_rear_wheel')) return { x: s.rearAxle, y: s.groundY - s.wheelRadius }
    if (id.includes('front_bumper')) return { x: s.frontEdge + 28, y: s.bodyBottomY - 7 }
    if (id.includes('rear_bumper')) return { x: s.rearEdge - 23, y: s.bodyBottomY - 5 }
    if (id.includes('front_door'))
      return { x: (s.windshieldBase.x + s.cabRearX) / 2, y: (s.beltlineY + s.bodyBottomY) / 2 }
    if (id.includes('rear_quarter')) return { x: s.rearAxle, y: s.beltlineY + 39 }
    if (id.includes('rear_cargo'))
      return { x: (s.cargoDoorRearX + s.rearDoorSeamX) / 2, y: (s.roofY + s.bodyBottomY) / 2 }
    if (id.includes('cargo_panel') || id.includes('sliding'))
      return { x: (s.cabRearX + s.cargoDoorRearX) / 2, y: (s.roofY + s.bodyBottomY) / 2 }
    if (id === 'hood') return { x: (s.hoodFront.x + s.hoodRear.x) / 2, y: s.hoodFront.y + 9 }
    if (id === 'windshield')
      return {
        x: (s.windshieldTop.x + s.windshieldBase.x) / 2,
        y: (s.windshieldTop.y + s.windshieldBase.y) / 2,
      }
    if (id.includes('mirror')) return { x: s.windshieldBase.x - 47, y: s.beltlineY + 16 }
    if (id.includes('headlight')) return { x: s.frontEdge + 68, y: s.hoodFront.y + 6 }
    if (id.includes('fender')) return { x: s.frontAxle, y: s.hoodFront.y + 39 }
    if (id.includes('rocker')) return { x: (s.frontAxle + s.rearAxle) / 2, y: s.bodyBottomY - 10 }
    return { x: s.cabRearX, y: s.roofY + 9 }
  }
  if (view === 'top') {
    const t = g.top
    if (id.includes('mirror'))
      return {
        x: t.windshieldX - 17,
        y: id.startsWith('driver') ? t.mirrorTop + 12 : t.mirrorBottom - 12,
      }
    const x = id.includes('front_bumper')
      ? t.frontEdge + 10
      : id === 'hood'
        ? (t.frontEdge + t.windshieldX) / 2
        : id === 'windshield'
          ? t.windshieldX
          : id === 'roof_front'
            ? (t.windshieldX + t.cabRearX) / 2
            : id === 'roof_center'
              ? (t.cabRearX + t.cargoRearX - 80) / 2
              : id === 'roof_rear'
                ? t.cargoRearX - 40
                : t.rearEdge
    return {
      x,
      y: id.startsWith('driver_')
        ? t.bodyTop + 8
        : id.startsWith('passenger_')
          ? t.bodyBottom - 8
          : t.centerY,
    }
  }
  const e = g.end
  const x = id.startsWith('driver_')
    ? (e.bodyLeft + e.centerX) / 2
    : id.startsWith('passenger_')
      ? (e.bodyRight + e.centerX) / 2
      : e.centerX
  const y = id.includes('roof')
    ? e.roofY + 16
    : id.includes('windshield')
      ? (e.roofY + e.beltlineY) / 2
      : id.includes('hood')
        ? e.beltlineY + 15
        : id.includes('bumper')
          ? e.bodyBottomY + 10
          : id.includes('door')
            ? (e.beltlineY + e.bodyBottomY) / 2
            : e.beltlineY + 56
  return { x, y }
}
