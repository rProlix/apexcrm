export type InspectionPeriod = 'SOD' | 'EOD' | 'UNKNOWN'

export type InspectionPeriodResult = {
  period: InspectionPeriod
  label: string
  shortLabel: string
  ariaLabel: string
  timeZone: string
}

export const DEFAULT_INSPECTION_TIME_ZONE = 'America/Los_Angeles'

const SOD_START_MINUTE = 7 * 60
const SOD_END_MINUTE = 11 * 60
const EOD_START_MINUTE = 11 * 60 + 1

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || !value.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )
}

export function resolveInspectionTimeZone(input?: {
  tenant?: Record<string, unknown> | null
  organizationTimeZone?: string | null
  fallback?: string | null
}) {
  const tenant = asRecord(input?.tenant)
  const branding = asRecord(tenant.branding)
  const settings = asRecord(tenant.settings)
  const locale = asRecord(branding.locale)
  const business = asRecord(branding.business)
  const configured = firstString(
    tenant.timezone,
    tenant.timeZone,
    settings.timezone,
    settings.timeZone,
    branding.timezone,
    branding.timeZone,
    locale.timezone,
    locale.timeZone,
    business.timezone,
    business.timeZone,
    input?.organizationTimeZone,
    input?.fallback,
    DEFAULT_INSPECTION_TIME_ZONE
  )
  return isValidTimeZone(configured) ? configured : DEFAULT_INSPECTION_TIME_ZONE
}

function getZonedParts(timestamp: string, timeZone: string): DateParts | null {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime()) || !isValidTimeZone(timeZone)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  const hour = Number(values.hour)
  const minute = Number(values.minute)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null
  return { year, month, day, hour: hour === 24 ? 0 : hour, minute }
}

export function getInspectionPeriod(
  timestamp: string | null | undefined,
  timeZone = DEFAULT_INSPECTION_TIME_ZONE
): InspectionPeriodResult {
  const resolvedTimeZone = resolveInspectionTimeZone({ fallback: timeZone })
  if (!timestamp) return unknownPeriod(resolvedTimeZone)
  const parts = getZonedParts(timestamp, resolvedTimeZone)
  if (!parts) return unknownPeriod(resolvedTimeZone)
  const localMinute = parts.hour * 60 + parts.minute
  const period =
    localMinute <= SOD_END_MINUTE || localMinute < SOD_START_MINUTE
      ? 'SOD'
      : localMinute >= EOD_START_MINUTE
        ? 'EOD'
        : 'SOD'
  return inspectionPeriodPresentation(period, resolvedTimeZone)
}

export function inspectionPeriodPresentation(
  period: InspectionPeriod,
  timeZone = DEFAULT_INSPECTION_TIME_ZONE
): InspectionPeriodResult {
  if (period === 'SOD') {
    return {
      period,
      label: 'Start of Day',
      shortLabel: 'SOD',
      ariaLabel: 'Start of Day inspection',
      timeZone,
    }
  }
  if (period === 'EOD') {
    return {
      period,
      label: 'End of Day',
      shortLabel: 'EOD',
      ariaLabel: 'End of Day inspection',
      timeZone,
    }
  }
  return unknownPeriod(timeZone)
}

function unknownPeriod(timeZone: string): InspectionPeriodResult {
  return {
    period: 'UNKNOWN',
    label: 'Unknown period',
    shortLabel: 'Unknown',
    ariaLabel: 'Inspection period unknown',
    timeZone,
  }
}

export function formatInspectionTimestamp(
  timestamp: string | null | undefined,
  options?: { timeZone?: string; fallback?: string; includeTimeZoneName?: boolean }
) {
  if (!timestamp) return options?.fallback ?? 'Pending'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return options?.fallback ?? 'Unknown'
  const timeZone = resolveInspectionTimeZone({ fallback: options?.timeZone })
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(options?.includeTimeZoneName ? { timeZoneName: 'short' as const } : {}),
  }).format(date)
}

export function formatInspectionDateOnly(
  timestamp: string | null | undefined,
  options?: { timeZone?: string; fallback?: string }
) {
  if (!timestamp) return options?.fallback ?? 'Unknown'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return options?.fallback ?? 'Unknown'
  const timeZone = resolveInspectionTimeZone({ fallback: options?.timeZone })
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function getInspectionLocalDateKey(
  timestamp: string | null | undefined,
  timeZone = DEFAULT_INSPECTION_TIME_ZONE
) {
  if (!timestamp) return null
  const resolvedTimeZone = resolveInspectionTimeZone({ fallback: timeZone })
  const parts = getZonedParts(timestamp, resolvedTimeZone)
  if (!parts) return null
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

export type InspectionDateGroup = 'Today' | 'Yesterday' | 'Earlier this week' | 'Older'

function dateKeyDayNumber(key: string | null) {
  if (!key) return null
  const [year, month, day] = key.split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return null
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function getInspectionDateGroup(
  timestamp: string | null | undefined,
  timeZone = DEFAULT_INSPECTION_TIME_ZONE,
  now = new Date()
): InspectionDateGroup {
  const inspectionDay = dateKeyDayNumber(getInspectionLocalDateKey(timestamp, timeZone))
  const currentDay = dateKeyDayNumber(getInspectionLocalDateKey(now.toISOString(), timeZone))
  if (inspectionDay == null || currentDay == null) return 'Older'
  const difference = currentDay - inspectionDay
  if (difference <= 0) return 'Today'
  if (difference === 1) return 'Yesterday'
  if (difference <= 6) return 'Earlier this week'
  return 'Older'
}
