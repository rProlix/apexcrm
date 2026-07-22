import { getInspectionLocalDateKey, getInspectionPeriod, type InspectionPeriod } from './inspection-period'

export const inspectionSortOptions = [
  'newest_damage', 'oldest_damage', 'latest_upload', 'oldest_upload',
  'newest_inspection', 'oldest_inspection', 'highest_severity', 'lowest_severity',
  'most_images', 'fewest_images', 'most_active_damage', 'recently_updated',
  'recently_reviewed', 'needs_review', 'repair_scheduled', 'in_repair', 'repaired',
  'driver_name', 'van_number', 'inspection_number',
] as const

export type InspectionSort = typeof inspectionSortOptions[number]
export type InspectionImageFilter = 'all' | 'has_images' | 'no_images'
export type InspectionReviewFilter = 'all' | 'needs_review' | 'ai_reviewed' | 'human_reviewed'
export type DamageStateFilter = 'all' | 'new_damage' | 'existing_damage' | 'recurring_damage' | 'duplicate_observations'

export type InspectionSearchRow = {
  id: string
  title: string | null
  status: string
  reviewStatus: string
  imageCount: number
  damageCount: number
  aiSummary: string | null
  aiConfidence: number | null
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
  uploadAt: string
  latestDamageAt: string | null
  firstDamageAt: string | null
  driverName: string
  driverId: string | null
  vanName: string
  vanNumber: string
  vanId: string | null
  inspectionNumber: string
  damageTypes: string[]
  regions: string[]
  severities: string[]
  observationTypes: string[]
  repairStatuses: string[]
  notes: string[]
  activeDamageCount: number
  latestImageId: string | null
}

export type InspectionSearchFilters = {
  q: string
  sort: InspectionSort
  driver: string
  van: string
  status: string
  severity: string
  damageType: string
  region: string
  period: InspectionPeriod | 'all'
  damageState: DamageStateFilter
  review: InspectionReviewFilter
  images: InspectionImageFilter
  repairStatus: string
  today: boolean
}

export const defaultInspectionSearchFilters: InspectionSearchFilters = {
  q: '',
  sort: 'newest_inspection',
  driver: 'all',
  van: 'all',
  status: 'all',
  severity: 'all',
  damageType: 'all',
  region: 'all',
  period: 'all',
  damageState: 'all',
  review: 'all',
  images: 'all',
  repairStatus: 'all',
  today: false,
}

const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 }

export function maxSeverity(row: InspectionSearchRow) {
  return Math.max(0, ...row.severities.map((severity) => severityRank[severity] ?? 0))
}

function includesValue(values: string[], value: string) {
  return values.some((entry) => entry.toLocaleLowerCase().includes(value))
}

function time(value: string | null) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function filterAndSortInspections(
  rows: InspectionSearchRow[],
  filters: InspectionSearchFilters,
  timeZone: string,
  now = new Date(),
) {
  const query = filters.q.trim().toLocaleLowerCase()
  const todayKey = getInspectionLocalDateKey(now.toISOString(), timeZone)
  const filtered = rows.filter((row) => {
    if (query) {
      const haystack = [
        row.vanNumber, row.vanName, row.inspectionNumber, row.id, row.title ?? '', row.driverName,
        row.aiSummary ?? '', ...row.damageTypes, ...row.regions, ...row.notes,
      ].join(' ').replaceAll('_', ' ').toLocaleLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (filters.driver !== 'all' && row.driverId !== filters.driver) return false
    if (filters.van !== 'all' && row.vanId !== filters.van) return false
    if (filters.status !== 'all' && row.status !== filters.status) return false
    if (filters.severity === 'severe' && maxSeverity(row) < 3) return false
    if (filters.severity !== 'all' && filters.severity !== 'severe' && !row.severities.includes(filters.severity)) return false
    if (filters.damageType !== 'all' && !row.damageTypes.includes(filters.damageType)) return false
    if (filters.region !== 'all' && !row.regions.includes(filters.region)) return false
    if (filters.period !== 'all' && getInspectionPeriod(row.uploadAt, timeZone).period !== filters.period) return false
    if (filters.images === 'has_images' && row.imageCount < 1) return false
    if (filters.images === 'no_images' && row.imageCount > 0) return false
    if (filters.review === 'needs_review' && row.status !== 'needs_review' && row.reviewStatus !== 'in_review') return false
    if (filters.review === 'ai_reviewed' && !row.aiSummary && row.status !== 'completed') return false
    if (filters.review === 'human_reviewed' && row.reviewStatus !== 'reviewed') return false
    if (filters.repairStatus !== 'all' && !row.repairStatuses.includes(filters.repairStatus)) return false
    if (filters.damageState === 'new_damage' && !row.observationTypes.includes('new_damage')) return false
    if (filters.damageState === 'existing_damage' && !row.observationTypes.includes('existing_damage_observed')) return false
    if (filters.damageState === 'recurring_damage' && !row.observationTypes.includes('recurrent_damage')) return false
    if (filters.damageState === 'duplicate_observations' && !row.observationTypes.includes('possible_duplicate')) return false
    if (filters.today && getInspectionLocalDateKey(row.uploadAt, timeZone) !== todayKey) return false
    return true
  })

  return filtered.sort((a, b) => compareInspections(a, b, filters.sort))
}

function compareInspections(a: InspectionSearchRow, b: InspectionSearchRow, sort: InspectionSort) {
  const newest = (left: string | null, right: string | null) => time(right) - time(left)
  const oldest = (left: string | null, right: string | null) => time(left) - time(right)
  const oldestDamage = (left: string | null, right: string | null) => {
    if (!left) return right ? 1 : 0
    if (!right) return -1
    return oldest(left, right)
  }
  switch (sort) {
    case 'newest_damage': return newest(a.latestDamageAt, b.latestDamageAt) || newest(a.createdAt, b.createdAt)
    case 'oldest_damage': return oldestDamage(a.firstDamageAt, b.firstDamageAt) || oldest(a.createdAt, b.createdAt)
    case 'latest_upload': return newest(a.uploadAt, b.uploadAt)
    case 'oldest_upload': return oldest(a.uploadAt, b.uploadAt)
    case 'oldest_inspection': return oldest(a.createdAt, b.createdAt)
    case 'highest_severity': return maxSeverity(b) - maxSeverity(a) || newest(a.createdAt, b.createdAt)
    case 'lowest_severity': return maxSeverity(a) - maxSeverity(b) || newest(a.createdAt, b.createdAt)
    case 'most_images': return b.imageCount - a.imageCount || newest(a.createdAt, b.createdAt)
    case 'fewest_images': return a.imageCount - b.imageCount || newest(a.createdAt, b.createdAt)
    case 'most_active_damage': return b.activeDamageCount - a.activeDamageCount || b.damageCount - a.damageCount
    case 'recently_updated': return newest(a.updatedAt, b.updatedAt)
    case 'recently_reviewed': return newest(a.reviewedAt, b.reviewedAt)
    case 'needs_review': return Number(b.status === 'needs_review' || b.reviewStatus === 'in_review') - Number(a.status === 'needs_review' || a.reviewStatus === 'in_review') || newest(a.createdAt, b.createdAt)
    case 'repair_scheduled': return Number(includesValue(b.repairStatuses, 'scheduled')) - Number(includesValue(a.repairStatuses, 'scheduled')) || newest(a.createdAt, b.createdAt)
    case 'in_repair': return Number(includesValue(b.repairStatuses, 'in_repair')) - Number(includesValue(a.repairStatuses, 'in_repair')) || newest(a.createdAt, b.createdAt)
    case 'repaired': return Number(b.repairStatuses.includes('repaired')) - Number(a.repairStatuses.includes('repaired')) || newest(a.createdAt, b.createdAt)
    case 'driver_name': return a.driverName.localeCompare(b.driverName, undefined, { numeric: true })
    case 'van_number': return a.vanNumber.localeCompare(b.vanNumber, undefined, { numeric: true })
    case 'inspection_number': return a.inspectionNumber.localeCompare(b.inspectionNumber, undefined, { numeric: true })
    case 'newest_inspection':
    default: return newest(a.createdAt, b.createdAt)
  }
}

export function isInspectionSort(value: string | undefined): value is InspectionSort {
  return inspectionSortOptions.includes(value as InspectionSort)
}

export function uniqueOptions(rows: InspectionSearchRow[], field: 'damageTypes' | 'regions' | 'severities' | 'repairStatuses') {
  return [...new Set(rows.flatMap((row) => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}
