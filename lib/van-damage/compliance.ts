import { formatDriverName } from './history'

export type InspectionSlotType = 'SOD' | 'EOD'
export type ComplianceStatus =
  | 'complete'
  | 'missing'
  | 'late'
  | 'partial'
  | 'images_missing'
  | 'analysis_processing'
  | 'analysis_failed'
  | 'needs_review'
  | 'excused'
  | 'duplicate_submission'
  | 'wrong_van'
  | 'wrong_inspection_type'

export interface InspectionSchedule {
  timeZone: string
  operatingDays: number[]
  sod: { required: boolean; dueTime: string; graceMinutes: number; requiredViews: string[] }
  eod: { required: boolean; dueTime: string; graceMinutes: number; requiredViews: string[] }
}

export interface ComplianceVehicle {
  id: string
  label: string
  status: string
  expectedDriver?: { id?: string | null; displayName?: string | null } | null
  scheduleOverride?: Partial<Pick<InspectionSchedule, 'operatingDays' | 'sod' | 'eod'>>
}

export interface ComplianceSubmission {
  id: string
  vanId: string | null
  inspectionType: InspectionSlotType | 'UNKNOWN'
  submittedAt: string
  status: string
  reviewStatus?: string
  images: Array<{ view: string | null; status: string; qualityStatus?: string | null }>
  uploader?: Record<string, unknown> | null
  identityMismatch?: 'wrong_van' | 'wrong_inspection_type' | null
  incomplete?: boolean
}

export interface ComplianceExcuse {
  vanId: string
  slotDate: string
  slotType: InspectionSlotType
  reason: string
}

export interface ComplianceSlotResult {
  key: string
  date: string
  vanId: string
  vanLabel: string
  slotType: InspectionSlotType
  dueAt: string
  graceEndsAt: string
  status: ComplianceStatus
  submissionId: string | null
  submittedAt: string | null
  requiredViews: string[]
  receivedViews: string[]
  missingViews: string[]
  duplicateViews: string[]
  unrecognizedViews: string[]
  lowQualityViews: string[]
  expectedDriver: string
  actualUploader: string
  missedStreak: number
}

export interface ComplianceMetrics {
  required: number
  completeOnTime: number
  completed: number
  complianceRate: number
  completionRate: number
  onTimeRate: number
  imageCompletenessRate: number
  analysisSuccessRate: number
}

const DEFAULT_ACTIVE_STATUSES = new Set(['active', 'available', 'in_service'])
const TERMINAL_FAILED = new Set(['failed'])
const PROCESSING = new Set(['queued', 'processing', 'analyzing'])

function partsInZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function zonedDateTime(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  for (let index = 0; index < 3; index += 1) {
    const local = partsInZone(candidate, timeZone)
    const represented = Date.UTC(
      Number(local.year),
      Number(local.month) - 1,
      Number(local.day),
      Number(local.hour),
      Number(local.minute)
    )
    const wanted = Date.UTC(year, month - 1, day, hour, minute)
    candidate = new Date(candidate.getTime() + wanted - represented)
  }
  return candidate
}

function dateInZone(value: string | Date, timeZone: string) {
  const parts = partsInZone(typeof value === 'string' ? new Date(value) : value, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function localWeekday(date: string, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
      .formatToParts(zonedDateTime(date, '12:00', timeZone))
      .find((part) => part.type === 'weekday')
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
          new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
            zonedDateTime(date, '12:00', timeZone)
          )
        )
      : -1
  )
}

function datesBetween(from: string, to: string) {
  const dates: string[] = []
  for (
    let cursor = new Date(`${from}T12:00:00Z`);
    cursor <= new Date(`${to}T12:00:00Z`);
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function resolveStatus(
  submission: ComplianceSubmission,
  dueAt: Date,
  graceEndsAt: Date,
  missingViews: string[],
  duplicates: string[]
): ComplianceStatus {
  if (submission.identityMismatch) return submission.identityMismatch
  if (TERMINAL_FAILED.has(submission.status)) return 'analysis_failed'
  if (PROCESSING.has(submission.status)) return 'analysis_processing'
  if (missingViews.length) return 'images_missing'
  if (submission.incomplete) return 'partial'
  if (submission.reviewStatus === 'pending' || submission.status === 'needs_review')
    return 'needs_review'
  if (duplicates.length) return 'duplicate_submission'
  if (new Date(submission.submittedAt) > graceEndsAt) return 'late'
  return new Date(submission.submittedAt) <= dueAt ? 'complete' : 'late'
}

export function getInspectionComplianceForTenant(input: {
  from: string
  to: string
  now: Date
  schedule: InspectionSchedule
  vehicles: ComplianceVehicle[]
  submissions: ComplianceSubmission[]
  excuses?: ComplianceExcuse[]
}): { slots: ComplianceSlotResult[]; metrics: ComplianceMetrics } {
  const slots: ComplianceSlotResult[] = []
  const excuses = new Map(
    (input.excuses ?? []).map((item) => [`${item.vanId}:${item.slotDate}:${item.slotType}`, item])
  )
  for (const vehicle of input.vehicles.filter((item) => DEFAULT_ACTIVE_STATUSES.has(item.status))) {
    const operatingDays = vehicle.scheduleOverride?.operatingDays ?? input.schedule.operatingDays
    for (const date of datesBetween(input.from, input.to)) {
      if (!operatingDays.includes(localWeekday(date, input.schedule.timeZone))) continue
      for (const slotType of ['SOD', 'EOD'] as const) {
        const base = slotType === 'SOD' ? input.schedule.sod : input.schedule.eod
        const rule = vehicle.scheduleOverride?.[slotType.toLowerCase() as 'sod' | 'eod'] ?? base
        if (!rule.required) continue
        const dueAt = zonedDateTime(date, rule.dueTime, input.schedule.timeZone)
        const graceEndsAt = new Date(dueAt.getTime() + rule.graceMinutes * 60_000)
        const candidates = input.submissions
          .filter(
            (item) =>
              item.vanId === vehicle.id &&
              item.inspectionType === slotType &&
              dateInZone(item.submittedAt, input.schedule.timeZone) === date
          )
          .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
        const submission = candidates[0]
        const recognized =
          submission?.images.map((image) => image.view?.toLowerCase() ?? '').filter(Boolean) ?? []
        const receivedViews = [...new Set(recognized)]
        const missingViews = rule.requiredViews.filter(
          (view) => !receivedViews.includes(view.toLowerCase())
        )
        const duplicateViews = receivedViews.filter(
          (view) => recognized.filter((item) => item === view).length > 1
        )
        const excuse = excuses.get(`${vehicle.id}:${date}:${slotType}`)
        const status = excuse
          ? 'excused'
          : submission
            ? candidates.length > 1
              ? 'duplicate_submission'
              : resolveStatus(submission, dueAt, graceEndsAt, missingViews, duplicateViews)
            : input.now > graceEndsAt
              ? 'missing'
              : 'analysis_processing'
        slots.push({
          key: `${vehicle.id}:${date}:${slotType}`,
          date,
          vanId: vehicle.id,
          vanLabel: vehicle.label,
          slotType,
          dueAt: dueAt.toISOString(),
          graceEndsAt: graceEndsAt.toISOString(),
          status,
          submissionId: submission?.id ?? null,
          submittedAt: submission?.submittedAt ?? null,
          requiredViews: rule.requiredViews,
          receivedViews,
          missingViews,
          duplicateViews,
          unrecognizedViews:
            submission?.images
              .filter((image) => !image.view || image.view === 'unknown')
              .map(() => 'Unknown') ?? [],
          lowQualityViews:
            submission?.images
              .filter((image) => image.qualityStatus === 'low_quality')
              .map((image) => image.view ?? 'Unknown') ?? [],
          expectedDriver: vehicle.expectedDriver?.displayName?.trim() || 'No assigned driver',
          actualUploader: submission?.uploader
            ? formatDriverName(submission.uploader)
            : 'Not submitted',
          missedStreak: 0,
        })
      }
    }
  }

  const streak = new Map<string, number>()
  for (const slot of slots.sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const key = `${slot.vanId}:${slot.slotType}`
    if (slot.status === 'missing') streak.set(key, (streak.get(key) ?? 0) + 1)
    else if (slot.status !== 'excused') streak.set(key, 0)
    slot.missedStreak = streak.get(key) ?? 0
  }
  const denominator = slots.filter((slot) => slot.status !== 'excused')
  const completeOnTime = denominator.filter((slot) => slot.status === 'complete').length
  const completed = denominator.filter((slot) =>
    ['complete', 'late', 'duplicate_submission'].includes(slot.status)
  ).length
  const imageComplete = denominator.filter((slot) => slot.missingViews.length === 0).length
  const analysisTerminal = denominator.filter((slot) =>
    ['complete', 'late', 'duplicate_submission', 'analysis_failed'].includes(slot.status)
  )
  const analysisSuccess = analysisTerminal.filter(
    (slot) => slot.status !== 'analysis_failed'
  ).length
  const ratio = (value: number, total: number) =>
    total ? Math.round((value / total) * 1000) / 10 : 0
  return {
    slots,
    metrics: {
      required: denominator.length,
      completeOnTime,
      completed,
      complianceRate: ratio(completeOnTime, denominator.length),
      completionRate: ratio(completed, denominator.length),
      onTimeRate: ratio(completeOnTime, completed),
      imageCompletenessRate: ratio(imageComplete, denominator.length),
      analysisSuccessRate: ratio(analysisSuccess, analysisTerminal.length),
    },
  }
}

export function defaultInspectionSchedule(timeZone: string): InspectionSchedule {
  return {
    timeZone,
    operatingDays: [1, 2, 3, 4, 5],
    sod: {
      required: true,
      dueTime: '10:00',
      graceMinutes: 30,
      requiredViews: ['front', 'rear', 'driver_side', 'passenger_side'],
    },
    eod: {
      required: true,
      dueTime: '20:00',
      graceMinutes: 30,
      requiredViews: ['front', 'rear', 'driver_side', 'passenger_side'],
    },
  }
}
