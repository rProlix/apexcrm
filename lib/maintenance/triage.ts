export const maintenanceCategories = [
  'engine_oil',
  'transmission',
  'brakes',
  'tires_wheels',
  'steering_suspension',
  'battery_electrical',
  'cooling_system',
  'hvac',
  'lights',
  'doors_locks',
  'windshield_glass',
  'fluids',
  'body_repair',
  'safety_equipment',
  'preventive_maintenance',
  'registration_compliance',
  'cleaning_sanitation',
  'other',
] as const

export type MaintenanceCategory = (typeof maintenanceCategories)[number]
export type MaintenanceSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'unknown'
export type OperationalImpact =
  | 'out_of_service'
  | 'restricted_use'
  | 'operational_with_caution'
  | 'operational'
  | 'unknown'
export type TimeSensitivity =
  | 'immediate'
  | 'same_day'
  | 'within_48_hours'
  | 'this_week'
  | 'routine'
  | 'unknown'
export type ResolutionEffort =
  | 'quick_fix'
  | 'on_site_service'
  | 'parts_required'
  | 'appointment_required'
  | 'repair_shop_required'
  | 'diagnostic_required'
  | 'unknown'
export type SchedulingDependency =
  | 'no_appointment'
  | 'internal_staff'
  | 'mobile_service'
  | 'shop_appointment'
  | 'vendor_availability'
  | 'parts_availability'
  | 'unknown'
export type EffectivePriority = 'urgent' | 'high' | 'normal' | 'low'

export type MaintenanceTriage = {
  category: MaintenanceCategory
  severity: MaintenanceSeverity
  operationalImpact: OperationalImpact
  timeSensitivity: TimeSensitivity
  resolutionEffort: ResolutionEffort
  schedulingDependency: SchedulingDependency
  effectivePriority: EffectivePriority
  priorityReason: string
  needsReview: boolean
  confidence: number
  matchedRule: string | null
}

type Rule = {
  id: string
  matches: RegExp[]
  excludes?: RegExp[]
  result: Omit<MaintenanceTriage, 'matchedRule'>
}

const rules: Rule[] = [
  {
    id: 'oil_pressure_warning',
    matches: [/\b(low|loss of|no)\s+oil\s+pressure\b/i, /\boil\s+pressure\s+(warning|light)\b/i],
    result: {
      category: 'engine_oil',
      severity: 'critical',
      operationalImpact: 'unknown',
      timeSensitivity: 'immediate',
      resolutionEffort: 'diagnostic_required',
      schedulingDependency: 'unknown',
      effectivePriority: 'urgent',
      priorityReason:
        'An oil-pressure warning may indicate immediate engine risk; stop-and-assess guidance requires human confirmation.',
      needsReview: true,
      confidence: 0.96,
    },
  },
  {
    id: 'low_oil_level',
    matches: [/\b(low|needs?|add)\s+(engine\s+)?oil\b/i, /\boil\s+level\s+(is\s+)?low\b/i],
    excludes: [/\boil\s+change\b/i, /\boil\s+pressure\b/i],
    result: {
      category: 'engine_oil',
      severity: 'high',
      operationalImpact: 'operational_with_caution',
      timeSensitivity: 'same_day',
      resolutionEffort: 'diagnostic_required',
      schedulingDependency: 'no_appointment',
      effectivePriority: 'high',
      priorityReason:
        'Low oil needs prompt level and leak checks; the report does not establish that the van is safe to operate.',
      needsReview: true,
      confidence: 0.88,
    },
  },
  {
    id: 'oil_change',
    matches: [/\boil\s+change\b/i, /\bchange\s+(the\s+)?oil\b/i],
    result: {
      category: 'preventive_maintenance',
      severity: 'moderate',
      operationalImpact: 'operational',
      timeSensitivity: 'this_week',
      resolutionEffort: 'appointment_required',
      schedulingDependency: 'shop_appointment',
      effectivePriority: 'normal',
      priorityReason:
        'Routine oil service should be scheduled this week; appointment lead time is tracked separately from safety urgency.',
      needsReview: false,
      confidence: 0.94,
    },
  },
  {
    id: 'brake_failure',
    matches: [/\bbrake(s)?\s+(failed|failure|not working|warning|light)\b/i, /\bno\s+brakes\b/i],
    result: {
      category: 'brakes',
      severity: 'critical',
      operationalImpact: 'out_of_service',
      timeSensitivity: 'immediate',
      resolutionEffort: 'repair_shop_required',
      schedulingDependency: 'shop_appointment',
      effectivePriority: 'urgent',
      priorityReason:
        'A reported brake failure or warning is safety-sensitive and requires immediate human assessment.',
      needsReview: true,
      confidence: 0.95,
    },
  },
  {
    id: 'overheating_or_leak',
    matches: [/\boverheat(ing|ed)?\b/i, /\b(coolant|fuel)\s+leak\b/i, /\bsmoke\b/i],
    result: {
      category: 'cooling_system',
      severity: 'critical',
      operationalImpact: 'out_of_service',
      timeSensitivity: 'immediate',
      resolutionEffort: 'diagnostic_required',
      schedulingDependency: 'mobile_service',
      effectivePriority: 'urgent',
      priorityReason:
        'Overheating, smoke, or a fluid leak may make continued operation unsafe; human confirmation is required.',
      needsReview: true,
      confidence: 0.91,
    },
  },
  {
    id: 'flat_tire',
    matches: [/\bflat\s+tire\b/i, /\btire\s+(is\s+)?flat\b/i, /\bseverely\s+low\s+tire\b/i],
    result: {
      category: 'tires_wheels',
      severity: 'high',
      operationalImpact: 'restricted_use',
      timeSensitivity: 'immediate',
      resolutionEffort: 'on_site_service',
      schedulingDependency: 'mobile_service',
      effectivePriority: 'urgent',
      priorityReason:
        'A flat or severely low tire needs immediate assessment before normal operation.',
      needsReview: true,
      confidence: 0.95,
    },
  },
  {
    id: 'low_tire_pressure',
    matches: [
      /\blow\s+tire\s+pressure\b/i,
      /\btire\s+(pressure\s+)?(is\s+)?low\b/i,
      /\bneeds?\s+air\b/i,
    ],
    result: {
      category: 'tires_wheels',
      severity: 'high',
      operationalImpact: 'operational_with_caution',
      timeSensitivity: 'same_day',
      resolutionEffort: 'quick_fix',
      schedulingDependency: 'no_appointment',
      effectivePriority: 'high',
      priorityReason:
        'Low tire pressure may affect safe operation but can often be checked and corrected quickly on site.',
      needsReview: true,
      confidence: 0.93,
    },
  },
  {
    id: 'door_latch',
    matches: [/\bdoor\s+(will not|won't|does not|doesn't)\s+(close|latch)\b/i, /\bdoor\s+latch\b/i],
    result: {
      category: 'doors_locks',
      severity: 'high',
      operationalImpact: 'restricted_use',
      timeSensitivity: 'same_day',
      resolutionEffort: 'diagnostic_required',
      schedulingDependency: 'internal_staff',
      effectivePriority: 'high',
      priorityReason:
        'A door that will not latch can affect cargo and occupant safety and needs prompt confirmation.',
      needsReview: true,
      confidence: 0.9,
    },
  },
  {
    id: 'washer_fluid',
    matches: [
      /\b(washer|windshield)\s+fluid\s+(is\s+)?low\b/i,
      /\blow\s+(washer|windshield)\s+fluid\b/i,
    ],
    result: {
      category: 'fluids',
      severity: 'low',
      operationalImpact: 'operational',
      timeSensitivity: 'same_day',
      resolutionEffort: 'quick_fix',
      schedulingDependency: 'no_appointment',
      effectivePriority: 'low',
      priorityReason:
        'Washer fluid is a low-severity quick fix that can be completed efficiently without displacing urgent work.',
      needsReview: false,
      confidence: 0.96,
    },
  },
  {
    id: 'wiper_or_bulb',
    matches: [
      /\bwiper(s|\s+blade)?\b/i,
      /\b(light\s+bulb|bulb|headlight|taillight)\s+(out|failed|failure)\b/i,
    ],
    result: {
      category: 'lights',
      severity: 'moderate',
      operationalImpact: 'operational_with_caution',
      timeSensitivity: 'same_day',
      resolutionEffort: 'quick_fix',
      schedulingDependency: 'internal_staff',
      effectivePriority: 'normal',
      priorityReason:
        'A visibility-related quick fix should be addressed promptly, with operating conditions confirmed by staff.',
      needsReview: true,
      confidence: 0.82,
    },
  },
  {
    id: 'appointment_service',
    matches: [
      /\b(alignment|tire replacement|transmission service|brake service|windshield replacement|diagnostic service|scheduled inspection)\b/i,
      /\bneeds?\s+(to\s+go\s+)?to\s+the\s+shop\b/i,
    ],
    result: {
      category: 'preventive_maintenance',
      severity: 'moderate',
      operationalImpact: 'unknown',
      timeSensitivity: 'this_week',
      resolutionEffort: 'appointment_required',
      schedulingDependency: 'shop_appointment',
      effectivePriority: 'normal',
      priorityReason:
        'This work appears appointment-dependent and should be scheduled early enough for shop availability.',
      needsReview: true,
      confidence: 0.76,
    },
  },
]

const ambiguous: MaintenanceTriage = {
  category: 'other',
  severity: 'unknown',
  operationalImpact: 'unknown',
  timeSensitivity: 'unknown',
  resolutionEffort: 'unknown',
  schedulingDependency: 'unknown',
  effectivePriority: 'normal',
  priorityReason:
    'The report did not match a high-confidence maintenance rule and needs human review.',
  needsReview: true,
  confidence: 0.25,
  matchedRule: null,
}

export function triageMaintenanceReport(
  text: string,
  options: { overdue?: boolean } = {}
): MaintenanceTriage {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const rule = rules.find(
    (candidate) =>
      candidate.matches.some((pattern) => pattern.test(normalized)) &&
      !(candidate.excludes ?? []).some((pattern) => pattern.test(normalized))
  )
  if (!rule) return { ...ambiguous }
  const result = { ...rule.result, matchedRule: rule.id }
  if (options.overdue && result.effectivePriority === 'normal') {
    return {
      ...result,
      effectivePriority: 'high',
      priorityReason: `${result.priorityReason} This item is overdue, increasing its effective priority.`,
    }
  }
  return result
}

export function maintenanceTitle(text: string, triage: MaintenanceTriage) {
  const labels: Record<MaintenanceCategory, string> = {
    engine_oil: 'Engine or oil issue',
    transmission: 'Transmission issue',
    brakes: 'Brake issue',
    tires_wheels: 'Tire or wheel issue',
    steering_suspension: 'Steering or suspension issue',
    battery_electrical: 'Battery or electrical issue',
    cooling_system: 'Cooling-system issue',
    hvac: 'HVAC issue',
    lights: 'Lighting issue',
    doors_locks: 'Door or lock issue',
    windshield_glass: 'Windshield or glass issue',
    fluids: 'Fluid service needed',
    body_repair: 'Body repair needed',
    safety_equipment: 'Safety equipment issue',
    preventive_maintenance: 'Scheduled maintenance',
    registration_compliance: 'Registration or compliance',
    cleaning_sanitation: 'Cleaning or sanitation',
    other: 'Maintenance report',
  }
  const firstSentence = text
    .trim()
    .split(/[.!?\n]/)[0]
    ?.trim()
  return firstSentence && firstSentence.length <= 100 ? firstSentence : labels[triage.category]
}

const priorityRank: Record<EffectivePriority, number> = { urgent: 4, high: 3, normal: 2, low: 1 }
const severityRank: Record<MaintenanceSeverity, number> = {
  critical: 5,
  high: 4,
  moderate: 3,
  low: 2,
  unknown: 1,
}
const timeRank: Record<TimeSensitivity, number> = {
  immediate: 6,
  same_day: 5,
  within_48_hours: 4,
  this_week: 3,
  routine: 2,
  unknown: 1,
}

export type MaintenancePriorityItem = {
  effectivePriority: EffectivePriority
  severity: MaintenanceSeverity
  operationalImpact: OperationalImpact
  timeSensitivity: TimeSensitivity
  resolutionEffort: ResolutionEffort
  reportedAt: string
  dueAt?: string | null
  scheduledAt?: string | null
  latestActivityAt: string
}

export function compareMaintenancePriority(
  a: MaintenancePriorityItem,
  b: MaintenancePriorityItem,
  now = Date.now()
) {
  const critical =
    Number(b.severity === 'critical' || b.operationalImpact === 'out_of_service') -
    Number(a.severity === 'critical' || a.operationalImpact === 'out_of_service')
  if (critical) return critical
  const urgent = timeRank[b.timeSensitivity] - timeRank[a.timeSensitivity]
  if (urgent) return urgent
  const priority = priorityRank[b.effectivePriority] - priorityRank[a.effectivePriority]
  if (priority) return priority
  const overdue =
    Number(Boolean(b.dueAt && Date.parse(b.dueAt) < now)) -
    Number(Boolean(a.dueAt && Date.parse(a.dueAt) < now))
  if (overdue) return overdue
  const safety = severityRank[b.severity] - severityRank[a.severity]
  if (safety) return safety
  const quick =
    Number(b.resolutionEffort === 'quick_fix') - Number(a.resolutionEffort === 'quick_fix')
  if (quick) return quick
  return (
    a.reportedAt.localeCompare(b.reportedAt) || b.latestActivityAt.localeCompare(a.latestActivityAt)
  )
}

export function applyMaintenanceOverride<T extends MaintenanceTriage>(
  current: T,
  changes: Partial<
    Pick<
      T,
      | 'severity'
      | 'operationalImpact'
      | 'timeSensitivity'
      | 'resolutionEffort'
      | 'schedulingDependency'
      | 'effectivePriority'
    >
  >,
  reason: string
) {
  if (!reason.trim()) throw new Error('An override reason is required')
  return {
    previous: { ...current },
    next: { ...current, ...changes, needsReview: false },
    reason: reason.trim(),
  }
}
