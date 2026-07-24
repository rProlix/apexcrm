import type { Json } from '@/lib/supabase/types'

export type CommandPriority = 'urgent' | 'high' | 'normal' | 'low'
export type CommandActionStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'snoozed'

export interface ActionCandidate {
  moduleKey: string
  sourceRecordType: string
  sourceRecordId: string
  sourceRecordLabel?: string | null
  actionType: string
  title: string
  description: string
  priority: CommandPriority
  assignedUserId?: string | null
  assignedRole?: 'admin' | 'manager' | 'staff' | null
  dueAt?: string | null
  latestActivityAt: string
  href: string
  metadata?: Json
}

export interface ActionItem extends ActionCandidate {
  id: string
  tenantId: string
  status: CommandActionStatus
  firstDetectedAt: string
  resolvedAt: string | null
  dismissedAt: string | null
  snoozedUntil: string | null
}

export type SetupStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'blocked'
  | 'optional'
  | 'dismissed'

export interface SetupChecklistItem {
  id: string
  moduleKey: string
  stepKey: string
  title: string
  description: string
  status: SetupStatus
  requiredPermission: string
  actionLabel: string
  actionHref: string
  required: boolean
  sortOrder: number
  completedAt: string | null
  blocker?: string
}

export interface ActivityItem {
  id: string
  moduleKey: string | null
  actor: string
  actorRole: string | null
  actionType: string
  sourceRecordType: string | null
  sourceRecordId: string | null
  title: string
  description: string
  href: string | null
  occurredAt: string
  visibility: 'staff' | 'admin' | 'owner'
}

export interface DailySummaryBullet {
  id: string
  moduleKey: string
  text: string
  value: number | string
  href: string
  critical?: boolean
}

export interface DailySummary {
  dateLabel: string
  startIso: string
  endIso: string
  timeZone: string
  sections: Array<{
    moduleKey: string
    title: string
    bullets: DailySummaryBullet[]
  }>
  criticalAlerts: DailySummaryBullet[]
  suggestedNextActions: Array<{ label: string; href: string }>
  freshnessTimestamp: string
  state: 'ready' | 'empty' | 'error'
}

export type NoteEntityType =
  | 'customer'
  | 'vehicle'
  | 'inspection'
  | 'damage_case'
  | 'maintenance_item'
  | 'appointment'
  | 'order'
  | 'payment'
  | 'website_lead'

export interface UniversalNoteAttachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  downloadHref: string
  createdAt: string
}

export interface UniversalNote {
  id: string
  entityType: NoteEntityType
  entityId: string
  authorUserId: string
  authorDisplay: string
  body: string
  source: string
  visibility: string
  createdAt: string
  updatedAt: string
  editedAt: string | null
  canEdit: boolean
  attachments: UniversalNoteAttachment[]
}
