import type {
  EffectivePriority,
  MaintenanceCategory,
  MaintenanceSeverity,
  OperationalImpact,
  ResolutionEffort,
  SchedulingDependency,
  TimeSensitivity,
} from './triage'

export type MaintenanceStatus =
  | 'reported'
  | 'needs_review'
  | 'approved'
  | 'scheduled'
  | 'waiting_for_parts'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'reopened'

export type MaintenanceItem = {
  id: string
  maintenance_number: number
  tenant_id: string
  business_id: string
  van_id: string | null
  title: string
  description: string
  category: MaintenanceCategory
  severity: MaintenanceSeverity
  operational_impact: OperationalImpact
  time_sensitivity: TimeSensitivity
  resolution_effort: ResolutionEffort
  scheduling_dependency: SchedulingDependency
  effective_priority: EffectivePriority
  priority_reason: string
  triage_confidence: number | null
  needs_review: boolean
  status: MaintenanceStatus
  source: string
  slack_reporter_id: string | null
  slack_channel_id: string | null
  slack_message_ts: string | null
  slack_thread_ts: string | null
  reporter_snapshot: Record<string, unknown>
  slack_source_available: boolean
  reported_at: string
  due_at: string | null
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  assigned_user_id: string | null
  assigned_name?: string | null
  mileage: number | null
  vendor: string | null
  estimated_cost: number | null
  actual_cost: number | null
  currency: string
  latest_note: string | null
  latest_activity_at: string
  related_inspection_id: string | null
  related_damage_case_id: string | null
  created_by: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  attachment_count?: number
  van?: { id: string; name: string; van_number: string | null } | null
}

export type MaintenanceHistoryEvent = {
  id: string
  maintenance_item_id: string
  event_type: string
  note: string | null
  previous_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  actor_type: string
  actor_user_id: string | null
  slack_reporter_id: string | null
  reporter_snapshot: Record<string, unknown>
  slack_channel_id: string | null
  slack_message_ts: string | null
  occurred_at: string
  metadata: Record<string, unknown>
  created_at: string
}

export const maintenanceResponsibilityDisclaimer =
  'Reporter information identifies who submitted the maintenance report and does not determine who caused the issue.'

export const damageReporterDisclaimer =
  'Reporter information identifies who submitted the inspection images and does not determine who caused the damage.'
