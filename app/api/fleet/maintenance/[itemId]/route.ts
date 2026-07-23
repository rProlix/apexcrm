import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { maintenanceCategories } from '@/lib/maintenance/triage'
import {
  resolveMaintenanceItemAccess,
  vehicleBelongsToTenant,
} from '@/lib/server/maintenance/access'

const updateSchema = z.object({
  action: z
    .enum(['approve', 'schedule', 'start', 'wait_for_parts', 'complete', 'cancel', 'reopen'])
    .optional(),
  reason: z.string().trim().max(2_000).optional(),
  vanId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(4_000).optional(),
  category: z.enum(maintenanceCategories).optional(),
  severity: z.enum(['critical', 'high', 'moderate', 'low', 'unknown']).optional(),
  operationalImpact: z
    .enum([
      'out_of_service',
      'restricted_use',
      'operational_with_caution',
      'operational',
      'unknown',
    ])
    .optional(),
  timeSensitivity: z
    .enum(['immediate', 'same_day', 'within_48_hours', 'this_week', 'routine', 'unknown'])
    .optional(),
  resolutionEffort: z
    .enum([
      'quick_fix',
      'on_site_service',
      'parts_required',
      'appointment_required',
      'repair_shop_required',
      'diagnostic_required',
      'unknown',
    ])
    .optional(),
  schedulingDependency: z
    .enum([
      'no_appointment',
      'internal_staff',
      'mobile_service',
      'shop_appointment',
      'vendor_availability',
      'parts_availability',
      'unknown',
    ])
    .optional(),
  effectivePriority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  mileage: z.number().nonnegative().nullable().optional(),
  vendor: z.string().trim().max(160).nullable().optional(),
  estimatedCost: z.number().nonnegative().nullable().optional(),
  actualCost: z.number().nonnegative().nullable().optional(),
})

const actionStatus = {
  approve: 'approved',
  schedule: 'scheduled',
  start: 'in_progress',
  wait_for_parts: 'waiting_for_parts',
  complete: 'completed',
  cancel: 'cancelled',
  reopen: 'reopened',
} as const

export async function GET(request: NextRequest, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params
  const loaded = await resolveMaintenanceItemAccess(
    itemId,
    request.nextUrl.searchParams.get('businessId')
  )
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const [history, attachments] = await Promise.all([
    loaded.db
      .from('fleet_maintenance_history')
      .select('*')
      .eq('maintenance_item_id', itemId)
      .eq('tenant_id', loaded.access.tenantId)
      .order('occurred_at'),
    loaded.db
      .from('fleet_maintenance_attachments')
      .select('id,filename,content_type,file_size_bytes,status,created_at')
      .eq('maintenance_item_id', itemId)
      .eq('tenant_id', loaded.access.tenantId)
      .order('created_at'),
  ])
  return NextResponse.json({
    item: loaded.item,
    history: history.data ?? [],
    attachments: attachments.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid maintenance update', details: parsed.error.flatten() },
      { status: 400 }
    )
  const loaded = await resolveMaintenanceItemAccess(
    itemId,
    typeof body?.businessId === 'string'
      ? body.businessId
      : request.nextUrl.searchParams.get('businessId'),
    { manage: true }
  )
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  if (!(await vehicleBelongsToTenant(loaded.access.tenantId, parsed.data.vanId))) {
    return NextResponse.json({ error: 'Vehicle scope mismatch' }, { status: 400 })
  }

  const triageKeys = [
    'category',
    'severity',
    'operationalImpact',
    'timeSensitivity',
    'resolutionEffort',
    'schedulingDependency',
    'effectivePriority',
  ] as const
  const changesTriage = triageKeys.some((key) => parsed.data[key] !== undefined)
  if (
    (changesTriage || ['complete', 'cancel', 'reopen'].includes(parsed.data.action ?? '')) &&
    !parsed.data.reason?.trim()
  ) {
    return NextResponse.json(
      { error: 'A reason is required for triage overrides and terminal status changes' },
      { status: 400 }
    )
  }
  const now = new Date().toISOString()
  const nextStatus = parsed.data.action ? actionStatus[parsed.data.action] : undefined
  const update = {
    ...(parsed.data.vanId !== undefined ? { van_id: parsed.data.vanId } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
    ...(parsed.data.operationalImpact !== undefined
      ? { operational_impact: parsed.data.operationalImpact }
      : {}),
    ...(parsed.data.timeSensitivity !== undefined
      ? { time_sensitivity: parsed.data.timeSensitivity }
      : {}),
    ...(parsed.data.resolutionEffort !== undefined
      ? { resolution_effort: parsed.data.resolutionEffort }
      : {}),
    ...(parsed.data.schedulingDependency !== undefined
      ? { scheduling_dependency: parsed.data.schedulingDependency }
      : {}),
    ...(parsed.data.effectivePriority !== undefined
      ? { effective_priority: parsed.data.effectivePriority }
      : {}),
    ...(parsed.data.dueAt !== undefined ? { due_at: parsed.data.dueAt } : {}),
    ...(parsed.data.scheduledAt !== undefined ? { scheduled_at: parsed.data.scheduledAt } : {}),
    ...(parsed.data.assignedUserId !== undefined
      ? { assigned_user_id: parsed.data.assignedUserId }
      : {}),
    ...(parsed.data.mileage !== undefined ? { mileage: parsed.data.mileage } : {}),
    ...(parsed.data.vendor !== undefined ? { vendor: parsed.data.vendor } : {}),
    ...(parsed.data.estimatedCost !== undefined
      ? { estimated_cost: parsed.data.estimatedCost }
      : {}),
    ...(parsed.data.actualCost !== undefined ? { actual_cost: parsed.data.actualCost } : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(parsed.data.action === 'schedule' ? { scheduled_at: parsed.data.scheduledAt ?? now } : {}),
    ...(parsed.data.action === 'start' ? { started_at: now } : {}),
    ...(parsed.data.action === 'complete' ? { completed_at: now } : {}),
    ...(parsed.data.action === 'cancel' ? { cancelled_at: now } : {}),
    ...(parsed.data.action === 'reopen' ? { completed_at: null, cancelled_at: null } : {}),
    ...(changesTriage ? { needs_review: false, priority_reason: parsed.data.reason! } : {}),
    latest_activity_at: now,
  }
  const { data: item, error } = await loaded.db
    .from('fleet_maintenance_items')
    .update(update)
    .eq('id', itemId)
    .eq('tenant_id', loaded.access.tenantId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await Promise.all([
    loaded.db.from('fleet_maintenance_history').insert({
      tenant_id: loaded.access.tenantId,
      business_id: loaded.access.businessId,
      van_id: item.van_id,
      maintenance_item_id: itemId,
      event_type: parsed.data.action
        ? `status_${nextStatus}`
        : changesTriage
          ? 'triage_overridden'
          : 'fields_updated',
      note: parsed.data.reason ?? null,
      previous_value: loaded.item,
      new_value: item,
      actor_type: 'crm_user',
      actor_user_id: loaded.access.userId,
      occurred_at: now,
    }),
    loaded.db.from('activity_logs').insert({
      tenant_id: loaded.access.tenantId,
      actor_type: 'user',
      actor_id: loaded.access.userId,
      action: parsed.data.action
        ? `fleet_maintenance_${parsed.data.action}`
        : 'fleet_maintenance_updated',
      entity_type: 'fleet_maintenance_item',
      entity_id: itemId,
      metadata: { reason: parsed.data.reason ?? null },
    }),
  ])
  return NextResponse.json({ item })
}
