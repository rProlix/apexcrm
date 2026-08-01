import {
  geminiDamageAnalysisSchema,
  type GeminiDamageAnalysis,
} from '../../../lib/van-damage/contracts.js'
import { safeParseGeminiJson } from '../../../lib/ai/parseGeminiJson.js'
import { reconcileVehicleAreaWithImageRole } from '../../../lib/van-damage/location-resolution.js'

type MutableRecord = Record<string, unknown>

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeBoundingBox(box: unknown): unknown {
  if (!box || typeof box !== 'object') return box

  const input = box as MutableRecord
  const x = finiteNumber(input.x)
  const y = finiteNumber(input.y)
  const width = finiteNumber(input.width)
  const height = finiteNumber(input.height)
  if (x == null || y == null || width == null || height == null) return box

  const maxValue = Math.max(x, y, width, height)
  const divisor = maxValue > 100 ? 1000 : maxValue > 1 ? 100 : 1
  const nx = Math.min(1, Math.max(0, x / divisor))
  const ny = Math.min(1, Math.max(0, y / divisor))
  const nwidth = Math.min(1 - nx, Math.max(0, width / divisor))
  const nheight = Math.min(1 - ny, Math.max(0, height / divisor))

  return { x: nx, y: ny, width: nwidth, height: nheight }
}

function normalizeGeminiAnalysis(
  value: unknown,
  imageRoles: ReadonlyArray<string | null | undefined>
): unknown {
  if (!value || typeof value !== 'object') return value
  const analysis = value as MutableRecord
  if (!Array.isArray(analysis.items)) return value

  let hasLocationConflict = false
  const normalizedItems = analysis.items.map((item, itemIndex) => {
    if (!item || typeof item !== 'object') return item
    const record = item as MutableRecord
    const reportedImageIndex = finiteNumber(record.imageIndex)
    const imageIndex =
      reportedImageIndex == null ? itemIndex : Math.max(0, Math.trunc(reportedImageIndex))
    const location = reconcileVehicleAreaWithImageRole(
      typeof record.vehicleArea === 'string' ? record.vehicleArea : null,
      imageRoles[imageIndex]
    )
    hasLocationConflict ||= location.conflict
    return {
      ...record,
      vehicleArea: location.vehicleArea,
      severity: calibratedSeverity(record.damageType, record.severity),
      boundingBox: record.boundingBox == null ? null : normalizeBoundingBox(record.boundingBox),
    }
  })
  const inferredRating = normalizedItems.reduce((rating, item) => {
    if (!item || typeof item !== 'object') return rating
    return Math.max(rating, ratingForDamageType((item as MutableRecord).damageType))
  }, 0)
  const reportedRating = finiteNumber(analysis.damageRating) ?? 0
  const damageRating = Math.max(
    0,
    Math.min(3, Math.round(Math.max(reportedRating, inferredRating)))
  )
  const labels = ['no_damage', 'dirt_or_debris', 'light_scratches', 'dents_or_damage'] as const

  return {
    ...analysis,
    damageRating,
    damageRatingLabel: labels[damageRating],
    items: normalizedItems,
    needsHumanReview: damageRating === 3,
    warnings: [
      ...(Array.isArray(analysis.warnings) ? analysis.warnings : []),
      ...(hasLocationConflict
        ? ['A vehicle-side label conflicted with its source image role and requires review.']
        : []),
    ],
  }
}

function ratingForDamageType(value: unknown) {
  if (
    [
      'dent',
      'crack',
      'broken_light',
      'broken_mirror',
      'bumper_damage',
      'glass_damage',
      'tire_wheel_damage',
      'interior_damage',
    ].includes(String(value))
  )
    return 3
  if (['scratch', 'paint_damage'].includes(String(value))) return 2
  if (value === 'dirt_debris') return 1
  return 0
}

function calibratedSeverity(damageType: unknown, severity: unknown) {
  const type = String(damageType)
  if (
    [
      'dent',
      'crack',
      'broken_light',
      'broken_mirror',
      'bumper_damage',
      'glass_damage',
      'tire_wheel_damage',
      'interior_damage',
    ].includes(type)
  ) {
    return severity === 'critical' ? 'critical' : 'high'
  }
  if (type === 'dirt_debris') return 'low'
  if (['scratch', 'paint_damage'].includes(type)) {
    return severity === 'medium' ? 'medium' : 'low'
  }
  return severity
}

export function parseDamageAnalysis(
  text: string,
  imageRoles: ReadonlyArray<string | null | undefined> = []
): {
  data: GeminiDamageAnalysis | null
  error: string | null
} {
  const parsed = safeParseGeminiJson<unknown>(text)
  if (!parsed.data) return { data: null, error: parsed.error }
  const validated = geminiDamageAnalysisSchema.safeParse(
    normalizeGeminiAnalysis(parsed.data, imageRoles)
  )
  if (!validated.success)
    return { data: null, error: validated.error.issues.map((issue) => issue.message).join('; ') }
  return { data: validated.data, error: null }
}
