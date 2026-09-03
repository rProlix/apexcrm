import { ACTIVE_DAMAGE_CASE_STATES, normalizeDamageSeverity } from './severity'

export type FleetDamageLevel = 0 | 1 | 2 | 3
export type FleetDamageAnalysisState = 'completed' | 'processing' | 'failed' | 'never'

export type FleetDamageVehicle = {
  id: string
  van_number: string | null
  name: string
  make: string | null
  model: string | null
  year: number | null
  plate_number: string | null
  status: string
  profileImageId?: string | null
}

export type FleetDamageCaseInput = {
  tenant_id: string
  business_id?: string | null
  van_id: string | null
  lifecycle_status: string | null
  current_severity?: string | null
  max_observed_severity?: string | null
  effective_severity?: string | null
  needs_review?: boolean | null
  last_observed_at?: string | null
  latest_observed_inspection_id?: string | null
  latest_evidence_image_id?: string | null
}

export type FleetAnalysisInput = {
  tenant_id: string
  van_id: string | null
  inspection_id: string
  inspection_status: string | null
  completed_at: string | null
  created_at: string
  run_status?: string | null
  run_completed_at?: string | null
}

export type FleetDamageCard = FleetDamageVehicle & {
  damageLevel: FleetDamageLevel
  needsReview: boolean
  activeDamageCount: number
  level3Count: number
  latestAnalysisAt: string | null
  latestObservationAt: string | null
  latestInspectionAt: string | null
  latestEvidenceImageId: string | null
  latestInspectionId: string | null
  analysisState: FleetDamageAnalysisState
  activeMaintenanceCount: number
  missingProfileImage: boolean
}

export function buildFleetDamageCards(input: {
  tenantId: string
  vehicles: FleetDamageVehicle[]
  damageCases: FleetDamageCaseInput[]
  analyses: FleetAnalysisInput[]
  maintenanceByVan?: Map<string, { activeCount: number }>
}): FleetDamageCard[] {
  const casesByVan = new Map<string, FleetDamageCaseInput[]>()
  for (const damageCase of input.damageCases) {
    if (
      damageCase.tenant_id !== input.tenantId ||
      damageCase.business_id !== input.tenantId ||
      !damageCase.van_id ||
      !ACTIVE_DAMAGE_CASE_STATES.has(damageCase.lifecycle_status ?? '')
    ) {
      continue
    }
    const current = casesByVan.get(damageCase.van_id) ?? []
    current.push(damageCase)
    casesByVan.set(damageCase.van_id, current)
  }

  const analysesByVan = new Map<string, FleetAnalysisInput[]>()
  for (const analysis of input.analyses) {
    if (analysis.tenant_id !== input.tenantId || !analysis.van_id) continue
    const current = analysesByVan.get(analysis.van_id) ?? []
    current.push(analysis)
    analysesByVan.set(analysis.van_id, current)
  }

  return input.vehicles.map((vehicle) => {
    const activeCases = casesByVan.get(vehicle.id) ?? []
    const analyses = analysesByVan.get(vehicle.id) ?? []
    const completed =
      analyses
        .map((analysis) => analysis.run_completed_at ?? analysis.completed_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null
    const latestInspectionAt =
      analyses
        .map((analysis) => analysis.created_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null
    const processing = analyses.some((analysis) =>
      ['queued', 'processing', 'running', 'in_progress'].includes(
        analysis.run_status ?? analysis.inspection_status ?? ''
      )
    )
    const failed = analyses.some((analysis) =>
      ['failed', 'error'].includes(analysis.run_status ?? analysis.inspection_status ?? '')
    )
    let damageLevel: FleetDamageLevel = 0
    let level3Count = 0
    let latestObservationAt: string | null = null
    let latestEvidenceImageId: string | null = null
    let latestInspectionId: string | null = null
    let needsReview = false

    for (const damageCase of activeCases) {
      const severity = normalizeDamageSeverity(
        damageCase.effective_severity ??
          damageCase.current_severity ??
          damageCase.max_observed_severity
      )
      const level = Math.min(3, Math.max(0, severity.level)) as FleetDamageLevel
      damageLevel = Math.max(damageLevel, level) as FleetDamageLevel
      if (level >= 3) level3Count += 1
      needsReview ||= Boolean(damageCase.needs_review)
      if (!latestObservationAt || (damageCase.last_observed_at ?? '') > latestObservationAt) {
        latestObservationAt = damageCase.last_observed_at ?? latestObservationAt
        latestEvidenceImageId = damageCase.latest_evidence_image_id ?? latestEvidenceImageId
        latestInspectionId = damageCase.latest_observed_inspection_id ?? latestInspectionId
      }
    }

    return {
      ...vehicle,
      damageLevel,
      needsReview,
      activeDamageCount: activeCases.length,
      level3Count,
      latestAnalysisAt: completed,
      latestObservationAt,
      latestInspectionAt,
      latestEvidenceImageId,
      latestInspectionId,
      analysisState: completed
        ? 'completed'
        : processing
          ? 'processing'
          : failed
            ? 'failed'
            : 'never',
      activeMaintenanceCount: input.maintenanceByVan?.get(vehicle.id)?.activeCount ?? 0,
      missingProfileImage: !vehicle.profileImageId,
    }
  })
}

export function compareFleetDamageCards(
  a: FleetDamageCard,
  b: FleetDamageCard,
  sort: string
): number {
  const newest = (left: string | null, right: string | null) => time(right) - time(left)
  switch (sort) {
    case 'lowest_damage':
      return a.damageLevel - b.damageLevel || newest(a.latestObservationAt, b.latestObservationAt)
    case 'recent_analysis':
      return newest(a.latestAnalysisAt, b.latestAnalysisAt)
    case 'oldest_analysis':
      return oldestNullableLast(a.latestAnalysisAt, b.latestAnalysisAt)
    case 'recent_observation':
      return newest(a.latestObservationAt, b.latestObservationAt)
    case 'oldest_unresolved':
      return oldestNullableLast(a.latestObservationAt, b.latestObservationAt)
    case 'van_desc':
      return vanSort(b, a)
    case 'needs_review':
      return Number(b.needsReview) - Number(a.needsReview) || b.damageLevel - a.damageLevel
    case 'out_of_service':
      return (
        Number(isOutOfService(b.status)) - Number(isOutOfService(a.status)) ||
        b.damageLevel - a.damageLevel
      )
    case 'most_damage':
      return b.activeDamageCount - a.activeDamageCount || b.damageLevel - a.damageLevel
    case 'most_maintenance':
      return b.activeMaintenanceCount - a.activeMaintenanceCount || b.damageLevel - a.damageLevel
    case 'van_asc':
      return vanSort(a, b)
    case 'highest_damage':
    default:
      return (
        b.damageLevel - a.damageLevel ||
        Number(b.needsReview) - Number(a.needsReview) ||
        newest(
          a.latestObservationAt ?? a.latestAnalysisAt,
          b.latestObservationAt ?? b.latestAnalysisAt
        )
      )
  }
}

function oldestNullableLast(left: string | null, right: string | null) {
  if (!left) return right ? 1 : 0
  if (!right) return -1
  return time(left) - time(right)
}

function vanSort(a: FleetDamageCard, b: FleetDamageCard) {
  return (a.van_number ?? a.name).localeCompare(b.van_number ?? b.name, undefined, {
    numeric: true,
  })
}

function time(value: string | null) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isOutOfService(status: string) {
  return ['out_of_service', 'inactive', 'maintenance', 'disabled'].includes(status)
}
