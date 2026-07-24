import 'server-only'

import type { AnyRole } from '@/lib/auth/types'
import type { Json } from '@/lib/supabase/types'
import { requireCommandCenterContext } from './context'
import { groupDateLabel } from './time'
import type { ActivityItem } from './types'
import { filterActivityItems, type ActivityFilterQuery } from './activityPolicy'

export type ActivityQuery = ActivityFilterQuery

interface RawActivityEvent {
  id: string
  source: 'audit' | 'activity'
  tenantId: string
  actorUserId: string | null
  actorType: string | null
  action: string
  entityType: string | null
  entityId: string | null
  metadata: Json
  createdAt: string
}

export async function loadActivityFeed(query: ActivityQuery = {}): Promise<{
  items: ActivityItem[]
  groups: Array<{ label: string; items: ActivityItem[] }>
  timeZone: string
  actors: string[]
  actionTypes: string[]
}> {
  const context = await requireCommandCenterContext('view_dashboard')
  const [{ data: audit, error: auditError }, { data: activity, error: activityError }] =
    await Promise.all([
      context.db
        .from('audit_logs')
        .select('id, tenant_id, actor_user_id, action, metadata, created_at')
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(400),
      context.db
        .from('activity_logs')
        .select(
          'id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata, created_at'
        )
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(400),
    ])
  if (auditError || activityError) {
    throw new Error(`Activity feed could not be loaded: ${auditError?.code ?? activityError?.code}`)
  }

  const rawEvents: RawActivityEvent[] = [
    ...(audit ?? []).map((event) => ({
      id: event.id,
      source: 'audit' as const,
      tenantId: event.tenant_id ?? context.tenantId,
      actorUserId: event.actor_user_id,
      actorType: null,
      action: event.action,
      entityType: stringMetadata(event.metadata, 'entity_type'),
      entityId: stringMetadata(event.metadata, 'entity_id'),
      metadata: event.metadata,
      createdAt: event.created_at,
    })),
    ...(activity ?? []).map((event) => ({
      id: event.id,
      source: 'activity' as const,
      tenantId: event.tenant_id,
      actorUserId: event.actor_id,
      actorType: event.actor_type,
      action: event.action,
      entityType: event.entity_type,
      entityId: event.entity_id,
      metadata: event.metadata,
      createdAt: event.created_at,
    })),
  ]

  const actorIds = Array.from(
    new Set(rawEvents.flatMap((event) => (event.actorUserId ? [event.actorUserId] : [])))
  )
  const actorMap = new Map<string, { email: string; role: string }>()
  if (actorIds.length > 0) {
    const { data: actors, error: actorsError } = await context.db
      .from('users')
      .select('id, email, role')
      .eq('tenant_id', context.tenantId)
      .in('id', actorIds)
    if (actorsError) throw new Error(`Activity actors could not be loaded: ${actorsError.code}`)
    for (const actor of actors ?? []) {
      actorMap.set(actor.id, { email: actor.email, role: actor.role })
    }
  }

  const projected = rawEvents
    .map((event) =>
      projectActivityEvent(
        event,
        actorMap.get(event.actorUserId ?? ''),
        context.activeModuleSet,
        context.role
      )
    )
    .filter((item): item is ActivityItem => item !== null)
  const items = filterActivityItems(projected, { ...query, timeZone: context.timeZone })

  const groupOrder = ['Today', 'Yesterday', 'Earlier this week', 'Older']
  const now = new Date()
  const groups = groupOrder
    .map((label) => ({
      label,
      items: items.filter(
        (item) => groupDateLabel(item.occurredAt, now, context.timeZone) === label
      ),
    }))
    .filter((group) => group.items.length > 0)

  return {
    items,
    groups,
    timeZone: context.timeZone,
    actors: Array.from(new Set(projected.map((item) => item.actor))).sort(),
    actionTypes: Array.from(new Set(projected.map((item) => item.actionType))).sort(),
  }
}

export function projectActivityEvent(
  event: RawActivityEvent,
  actor: { email: string; role: string } | undefined,
  activeModules: Set<string>,
  role: AnyRole
): ActivityItem | null {
  const metadata = asRecord(event.metadata)
  const moduleKey = inferModuleKey(event.action, metadata, event.entityType)
  const visibility = inferVisibility(event.action)

  if (moduleKey && !activeModules.has(moduleKey)) return null
  if (visibility === 'owner' && role !== 'owner') return null
  if (visibility === 'admin' && !['owner', 'admin', 'manager'].includes(role)) return null

  const actorLabel = actor
    ? displayNameFromEmail(actor.email)
    : event.actorType === 'system' || !event.actorUserId
      ? 'System'
      : 'Team member'
  const presentation = presentEvent(event.action, metadata, event.entityType, actorLabel)
  if (!presentation) return null

  return {
    id: event.id,
    moduleKey,
    actor: actorLabel,
    actorRole: actor?.role ?? event.actorType,
    actionType: event.action,
    sourceRecordType: event.entityType,
    sourceRecordId: event.entityId,
    title: presentation.title,
    description: presentation.description,
    href: controlledEntityHref(event.entityType, event.entityId, metadata),
    occurredAt: event.createdAt,
    visibility,
  }
}

function presentEvent(
  action: string,
  metadata: Record<string, unknown>,
  entityType: string | null,
  actor: string
): { title: string; description: string } | null {
  const vehicle = firstText(metadata, ['van_number', 'vehicle_name', 'vehicle_label'])
  const subject = firstText(metadata, ['title', 'label', 'name'])

  const known: Array<[RegExp, () => { title: string; description: string }]> = [
    [
      /inspection.*(created|uploaded|received)/i,
      () => ({
        title: `${actor} uploaded inspection images${vehicle ? ` for ${vehicle}` : ''}`,
        description: 'A new vehicle inspection was received.',
      }),
    ],
    [
      /inspection.*review/i,
      () => ({
        title: `${actor} reviewed${vehicle ? ` ${vehicle}` : ' an inspection'}`,
        description: 'The inspection review status changed.',
      }),
    ],
    [
      /(level.?3|severe).*confirm/i,
      () => ({
        title: `${actor} reviewed Level 3 damage${vehicle ? ` for ${vehicle}` : ''}`,
        description: 'A severe damage finding was reviewed.',
      }),
    ],
    [
      /maintenance.*(complete|resolved)/i,
      () => ({
        title: `${actor} completed ${subject || 'a maintenance item'}`,
        description: vehicle ? `Vehicle: ${vehicle}` : 'Maintenance work was completed.',
      }),
    ],
    [
      /maintenance.*(created|reported)/i,
      () => ({
        title: `${actor} reported ${subject || 'a maintenance issue'}`,
        description: vehicle ? `Vehicle: ${vehicle}` : 'A maintenance item was created.',
      }),
    ],
    [
      /appointment.*(created|requested)/i,
      () => ({
        title: `${actor} created an appointment`,
        description: subject || 'A new appointment was added.',
      }),
    ],
    [
      /appointment.*(updated|availability|changed)/i,
      () => ({
        title: `${actor} updated appointment availability`,
        description: 'Bookable schedule settings changed.',
      }),
    ],
    [
      /payment.*(connected|provider.*updated)/i,
      () => ({
        title: `${actor} updated the payment connection`,
        description: 'Payment provider settings changed.',
      }),
    ],
    [
      /slack.*channel/i,
      () => ({
        title: `${actor} changed a Slack channel`,
        description: subject || 'An integration channel setting changed.',
      }),
    ],
    [
      /(domain.*connected|connected.*domain)/i,
      () => ({
        title: `${actor} connected a website domain`,
        description: 'The website domain configuration changed.',
      }),
    ],
    [
      /report.*(generated|downloaded)/i,
      () => ({
        title: `${actor} ${action.includes('download') ? 'downloaded' : 'generated'} a report`,
        description: subject || 'A business report was created.',
      }),
    ],
    [
      /note.*created/i,
      () => ({
        title: `${actor} added a note`,
        description: entityType
          ? `Record type: ${friendlyEntity(entityType)}`
          : 'A record note was added.',
      }),
    ],
    [
      /notification.*rule/i,
      () => ({
        title: `${actor} updated notification rules`,
        description: 'Business notification preferences changed.',
      }),
    ],
    [
      /command_center\.action\.(resolved|dismissed|snoozed|in_progress)/i,
      () => ({
        title: `${actor} updated an action item`,
        description: friendlyAction(firstText(metadata, ['action_type']) || 'action'),
      }),
    ],
  ]

  for (const [pattern, build] of known) {
    if (pattern.test(action)) return build()
  }

  if (action.startsWith('command_center.action.created')) {
    return {
      title: 'Action required item detected',
      description: friendlyAction(firstText(metadata, ['action_type']) || 'action'),
    }
  }

  // Preserve useful, non-technical events without exposing raw metadata.
  if (/created|updated|completed|published|connected|uploaded|reviewed/i.test(action)) {
    return {
      title: `${actor} ${friendlyAction(action)}`,
      description:
        subject ||
        (entityType ? `${friendlyEntity(entityType)} was updated.` : 'A business record changed.'),
    }
  }
  return null
}

function inferModuleKey(
  action: string,
  metadata: Record<string, unknown>,
  entityType: string | null
): string | null {
  const explicit = firstText(metadata, ['module_key', 'module'])
  if (explicit) return explicit
  const value = `${action} ${entityType ?? ''}`.toLowerCase()
  if (/inspection|damage|van_damage/.test(value)) return 'damage_ai'
  if (/maintenance/.test(value)) return 'maintenance'
  if (/vehicle|fleet|van/.test(value)) return 'vehicles'
  if (/appointment|availability/.test(value)) return 'appointments'
  if (/payment|refund|invoice/.test(value)) return 'payments'
  if (/order|product|store|inventory/.test(value)) return 'store'
  if (/reward/.test(value)) return 'rewards'
  if (/website|domain|page|lead_form/.test(value)) return 'website'
  if (/customer|lead/.test(value)) return 'customers'
  return null
}

function inferVisibility(action: string): ActivityItem['visibility'] {
  if (/infrastructure|inspection.*metadata|provider.*diagnostic|owner/i.test(action)) {
    return 'owner'
  }
  if (/permission|role|staff|settings|notification.*rule|dismissed/i.test(action)) {
    return 'admin'
  }
  return 'staff'
}

function controlledEntityHref(
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown>
): string | null {
  const href = firstText(metadata, ['href'])
  if (href?.startsWith('/')) return href
  if (!entityId) return null
  const routes: Record<string, (id: string) => string> = {
    vehicle: (id) => `/dashboard/vehicles/${id}`,
    inspection: (id) => `/dashboard/damage-ai/inspections/${id}`,
    customer: (id) => `/customers/${id}`,
    maintenance_item: (id) => `/dashboard/vehicles/maintenance?itemId=${id}`,
    appointment: () => '/appointments/list',
    order: () => '/store/orders',
    payment: () => '/payments',
    website: () => '/website',
  }
  return entityType && routes[entityType] ? routes[entityType](entityId) : null
}

function stringMetadata(value: Json, key: string): string | null {
  const result = asRecord(value)[key]
  return typeof result === 'string' ? result : null
}

function firstText(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function displayNameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function friendlyAction(value: string): string {
  return value
    .replace(/^[^.]+\./, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function friendlyEntity(value: string): string {
  return value.replace(/_/g, ' ')
}
