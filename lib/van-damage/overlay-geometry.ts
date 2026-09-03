export type NormalizedBox = { x: number; y: number; width: number; height: number }
export type OverlayValidationReason =
  | 'missing_box'
  | 'invalid_number'
  | 'invalid_dimensions'
  | 'outside_image'
  | 'too_small'
  | 'too_large'
  | 'wrong_image'
  | 'low_confidence'

export type OverlayGeometryResult =
  | { ok: true; box: NormalizedBox; source: 'normalized' | 'percent' | 'pixel' }
  | { ok: false; reason: OverlayValidationReason }

export function resolveDamageOverlayGeometry(input: {
  box: unknown
  imageId: string
  findingImageId?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  orientation?: number | null
  confidence?: number | null
  minimumConfidence?: number
}): OverlayGeometryResult {
  if (input.findingImageId && input.findingImageId !== input.imageId)
    return { ok: false, reason: 'wrong_image' }
  if (
    input.minimumConfidence != null &&
    input.confidence != null &&
    input.confidence < input.minimumConfidence
  ) {
    return { ok: false, reason: 'low_confidence' }
  }
  const box = readBox(input.box)
  if (!box) return { ok: false, reason: 'missing_box' }
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) {
    return { ok: false, reason: 'invalid_number' }
  }
  if (box.width <= 0 || box.height <= 0) return { ok: false, reason: 'invalid_dimensions' }

  const oriented = orientedSize(input.imageWidth, input.imageHeight, input.orientation)
  const maxValue = Math.max(
    box.x,
    box.y,
    box.width,
    box.height,
    box.x + box.width,
    box.y + box.height
  )
  let source: 'normalized' | 'percent' | 'pixel' = 'normalized'
  let normalized = box

  if (maxValue > 1.5 && maxValue <= 100.5) {
    source = 'percent'
    normalized = {
      x: box.x / 100,
      y: box.y / 100,
      width: box.width / 100,
      height: box.height / 100,
    }
  } else if (maxValue > 100.5) {
    if (!oriented) return { ok: false, reason: 'invalid_dimensions' }
    source = 'pixel'
    normalized = {
      x: box.x / oriented.width,
      y: box.y / oriented.height,
      width: box.width / oriented.width,
      height: box.height / oriented.height,
    }
  }

  const corrected = applyOrientation(normalized, input.orientation)
  if (
    corrected.x < -0.001 ||
    corrected.y < -0.001 ||
    corrected.x + corrected.width > 1.001 ||
    corrected.y + corrected.height > 1.001
  ) {
    return { ok: false, reason: 'outside_image' }
  }
  const area = corrected.width * corrected.height
  if (area < 0.0001) return { ok: false, reason: 'too_small' }
  if (area > 0.92) return { ok: false, reason: 'too_large' }
  return { ok: true, box: clampTinyDrift(corrected), source }
}

export function overlayBoxStyle(box: NormalizedBox): Record<string, string> {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  }
}

function readBox(value: unknown): NormalizedBox | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    x: numberValue(record.x ?? record.left),
    y: numberValue(record.y ?? record.top),
    width: numberValue(record.width ?? record.w),
    height: numberValue(record.height ?? record.h),
  }
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return Number.NaN
}

function orientedSize(width?: number | null, height?: number | null, orientation?: number | null) {
  if (!width || !height || width <= 0 || height <= 0) return null
  return swapsAxes(orientation) ? { width: height, height: width } : { width, height }
}

function applyOrientation(box: NormalizedBox, orientation?: number | null): NormalizedBox {
  switch (orientation) {
    case 3:
      return {
        x: 1 - box.x - box.width,
        y: 1 - box.y - box.height,
        width: box.width,
        height: box.height,
      }
    case 6:
      return { x: 1 - box.y - box.height, y: box.x, width: box.height, height: box.width }
    case 8:
      return { x: box.y, y: 1 - box.x - box.width, width: box.height, height: box.width }
    default:
      return box
  }
}

function swapsAxes(orientation?: number | null) {
  return orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8
}

function clampTinyDrift(box: NormalizedBox): NormalizedBox {
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return {
    x: clamp(box.x),
    y: clamp(box.y),
    width: clamp(box.width),
    height: clamp(box.height),
  }
}
