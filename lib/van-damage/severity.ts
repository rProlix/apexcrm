export type NormalizedDamageSeverity = {
  level: number
  label: 'none' | 'level_1' | 'level_2' | 'level_3' | 'level_4'
  recognized: boolean
  severe: boolean
}

const LEVEL_0 = new Set([
  '0',
  'none',
  'no damage',
  'no_damage',
  'no damage detected',
  'no_damage_detected',
])
const LEVEL_1 = new Set([
  '1',
  'level 1',
  'level_1',
  'level1',
  'low',
  'minor',
  'dirt',
  'debris',
  'dirt or debris',
  'dirt_or_debris',
])
const LEVEL_2 = new Set([
  '2',
  'level 2',
  'level_2',
  'level2',
  'medium',
  'moderate',
  'light scratches',
  'light_scratches',
  'scratch',
  'scratches',
])
const LEVEL_3 = new Set([
  '3',
  'level 3',
  'level_3',
  'level3',
  'high',
  'severe',
  'dents or damage',
  'dents_or_damage',
])
const LEVEL_4 = new Set(['4', 'level 4', 'level_4', 'level4', 'critical', 'extreme'])

export function normalizeDamageSeverity(value: unknown): NormalizedDamageSeverity {
  const normalized =
    typeof value === 'number' && Number.isFinite(value)
      ? String(Math.trunc(value))
      : typeof value === 'string'
        ? value.trim().toLowerCase().replace(/[-]+/g, ' ').replace(/\s+/g, ' ')
        : ''

  const numericLevel = /^\d+$/.test(normalized)
    ? Number(normalized)
    : /^level[ _]?\d+$/.test(normalized)
      ? Number(normalized.replace(/\D/g, ''))
      : null
  const matched =
    numericLevel != null
      ? Math.max(0, numericLevel)
      : LEVEL_4.has(normalized)
        ? 4
        : LEVEL_3.has(normalized)
          ? 3
          : LEVEL_2.has(normalized)
            ? 2
            : LEVEL_1.has(normalized)
              ? 1
              : LEVEL_0.has(normalized)
                ? 0
                : null

  if (matched == null) return { level: 0, label: 'none', recognized: false, severe: false }
  return {
    level: matched,
    label:
      matched >= 4
        ? 'level_4'
        : matched === 3
          ? 'level_3'
          : matched === 2
            ? 'level_2'
            : matched === 1
              ? 'level_1'
              : 'none',
    recognized: true,
    severe: matched >= 3,
  }
}

export function effectiveDamageSeverity(input: {
  effectiveSeverity?: unknown
  currentSeverity?: unknown
  maxObservedSeverity?: unknown
}) {
  const reviewed = normalizeDamageSeverity(input.effectiveSeverity)
  if (reviewed.recognized) return reviewed
  const current = normalizeDamageSeverity(input.currentSeverity)
  if (current.recognized) return current
  return normalizeDamageSeverity(input.maxObservedSeverity)
}

export const ACTIVE_DAMAGE_CASE_STATES = new Set([
  'active',
  'needs_review',
  'confirmed',
  'repair_scheduled',
  'in_repair',
  'awaiting_verification',
  'recurrent',
])

export type FleetAttentionCandidate = {
  tenantId: string
  vanId: string
  lifecycleStatus: string
  currentSeverity?: unknown
  maxObservedSeverity?: unknown
  effectiveSeverity?: unknown
  inspectionId?: string | null
  imageId?: string | null
  observedAt?: string | null
}

export type UniqueSevereVan = {
  tenantId: string
  vanId: string
  severeSourceCount: number
  highestSeverityLevel: number
  latestInspectionId: string | null
  latestImageId: string | null
  lastObservedAt: string | null
}

export function aggregateUniqueSevereVans(
  candidates: FleetAttentionCandidate[]
): UniqueSevereVan[] {
  const byVan = new Map<string, UniqueSevereVan>()
  for (const candidate of candidates) {
    if (!ACTIVE_DAMAGE_CASE_STATES.has(candidate.lifecycleStatus)) continue
    const severity = effectiveDamageSeverity(candidate)
    if (!severity.severe) continue
    const key = `${candidate.tenantId}:${candidate.vanId}`
    const current = byVan.get(key)
    const isNewer =
      !current?.lastObservedAt ||
      Boolean(candidate.observedAt && candidate.observedAt > current.lastObservedAt)
    if (!current) {
      byVan.set(key, {
        tenantId: candidate.tenantId,
        vanId: candidate.vanId,
        severeSourceCount: 1,
        highestSeverityLevel: severity.level,
        latestInspectionId: candidate.inspectionId ?? null,
        latestImageId: candidate.imageId ?? null,
        lastObservedAt: candidate.observedAt ?? null,
      })
      continue
    }
    current.severeSourceCount += 1
    current.highestSeverityLevel = Math.max(current.highestSeverityLevel, severity.level)
    if (isNewer) {
      current.latestInspectionId = candidate.inspectionId ?? current.latestInspectionId
      current.latestImageId = candidate.imageId ?? current.latestImageId
      current.lastObservedAt = candidate.observedAt ?? current.lastObservedAt
    }
  }
  return [...byVan.values()]
}
