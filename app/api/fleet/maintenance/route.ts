import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { maintenanceCategories, triageMaintenanceReport } from '@/lib/maintenance/triage'
import { vehicleBelongsToTenant } from '@/lib/server/maintenance/access'

const createSchema = z.object({
  businessId: z.string().uuid().optional(),
  vanId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
  category: z.enum(maintenanceCategories).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  mileage: z.number().nonnegative().nullable().optional(),
  vendor: z.string().trim().max(160).nullable().optional(),
  estimatedCost: z.number().nonnegative().nullable().optional(),
  relatedInspectionId: z.string().uuid().nullable().optional(),
  relatedDamageCaseId: z.string().uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'))
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const db = getVanDamageServiceClient()
  const status = request.nextUrl.searchParams.get('status')
  const vanId = request.nextUrl.searchParams.get('vanId')
  let query = db
    .from('fleet_maintenance_items')
    .select('*')
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)
    .order('latest_activity_at', { ascending: false })
    .limit(500)
  if (status) query = query.eq('status', status)
  if (vanId) query = query.eq('van_id', vanId)
  const { data, error } = await query
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ items: data })
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid maintenance report', details: parsed.error.flatten() },
      { status: 400 }
    )
  const access = await resolveVanDamageAccess(parsed.data.businessId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!(await vehicleBelongsToTenant(access.tenantId, parsed.data.vanId))) {
    return NextResponse.json({ error: 'Vehicle scope mismatch' }, { status: 400 })
  }

  const triage = triageMaintenanceReport(parsed.data.description)
  const now = new Date().toISOString()
  const db = getVanDamageServiceClient()
  const { data: item, error } = await db
    .from('fleet_maintenance_items')
    .insert({
      tenant_id: access.tenantId,
      business_id: access.businessId,
      van_id: parsed.data.vanId ?? null,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category ?? triage.category,
      severity: triage.severity,
      operational_impact: triage.operationalImpact,
      time_sensitivity: triage.timeSensitivity,
      resolution_effort: triage.resolutionEffort,
      scheduling_dependency: triage.schedulingDependency,
      effective_priority: triage.effectivePriority,
      priority_reason: triage.priorityReason,
      triage_confidence: triage.confidence,
      needs_review: triage.needsReview || !parsed.data.vanId,
      status: triage.needsReview || !parsed.data.vanId ? 'needs_review' : 'reported',
      source: 'manual',
      reported_at: now,
      due_at: parsed.data.dueAt ?? null,
      assigned_user_id: parsed.data.assignedUserId ?? null,
      mileage: parsed.data.mileage ?? null,
      vendor: parsed.data.vendor ?? null,
      estimated_cost: parsed.data.estimatedCost ?? null,
      related_inspection_id: parsed.data.relatedInspectionId ?? null,
      related_damage_case_id: parsed.data.relatedDamageCaseId ?? null,
      created_by: access.userId,
      latest_note: parsed.data.description,
      latest_activity_at: now,
    })
    .select('*')
    .single()
  if (error || !item)
    return NextResponse.json(
      { error: error?.message ?? 'Unable to create maintenance item' },
      { status: 500 }
    )

  const [{ error: historyError }] = await Promise.all([
    db.from('fleet_maintenance_history').insert({
      tenant_id: access.tenantId,
      business_id: access.businessId,
      van_id: item.van_id,
      maintenance_item_id: item.id,
      event_type: 'reported',
      note: parsed.data.description,
      new_value: triage,
      actor_type: 'crm_user',
      actor_user_id: access.userId,
      occurred_at: now,
    }),
    db.from('activity_logs').insert({
      tenant_id: access.tenantId,
      actor_type: 'user',
      actor_id: access.userId,
      action: 'fleet_maintenance_created',
      entity_type: 'fleet_maintenance_item',
      entity_id: item.id,
      metadata: { source: 'manual' },
    }),
  ])
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 })
  return NextResponse.json({ item }, { status: 201 })
}
