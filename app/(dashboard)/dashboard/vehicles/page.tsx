export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { UserRound, Wrench } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  FleetNeedsAttentionBoard,
  type FleetAttentionRow,
  type FleetVehicleRow,
} from '@/components/van-damage/FleetNeedsAttentionBoard'
import { resolveInspectionTimeZone } from '@/lib/van-damage/inspection-period'
import {
  buildFleetDamageCards,
  type FleetAnalysisInput,
  type FleetDamageCaseInput,
} from '@/lib/van-damage/fleet-damage'
import { selectVehicleProfileImage, type VehicleImageCandidate } from '@/lib/van-damage/inspection-vehicle'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata = { title: 'Fleet — NexoraNow' }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string) => LooseQuery
  in: (column: string, values: string[]) => LooseQuery
  not: (column: string, operator: string, value: string) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => Promise<{ data: unknown[] | null; error?: { message: string } | null }>
}

type MaintenanceRawRow = {
  id: string
  van_id: string | null
  title: string
  status: string
  effective_priority: string
  severity: string | null
  operational_impact: string | null
  resolution_effort: string | null
  due_at: string | null
  latest_activity_at: string
}

type InspectionRawRow = {
  id: string
  tenant_id: string
  van_id: string | null
  status: string | null
  created_at: string
  completed_at: string | null
}

type RunRawRow = {
  inspection_id: string
  tenant_id: string
  status: string | null
  completed_at: string | null
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!
  await guardModuleAccess(tenantId, 'vehicles', ctx.role)

  const db = getSupabaseServerClient()
  const looseDb = db as unknown as {
    from: (table: string) => LooseQuery
  }
  const [
    vehiclesResult,
    attentionResult,
    tenantResult,
    maintenanceResult,
    damageCasesResult,
    inspectionResult,
    runResult,
    imageResult,
  ] = await Promise.all([
      db
        .from('vehicles')
        .select(
          'id, name, van_number, make, model, year, plate_number, status, metadata, updated_at'
        )
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(250),
      db.rpc('get_fleet_needs_attention', { p_tenant_id: tenantId, p_business_id: tenantId }),
      db.from('tenants').select('branding').eq('id', tenantId).maybeSingle(),
      db
        .from('fleet_maintenance_items')
        .select(
          'id,van_id,title,status,effective_priority,severity,operational_impact,resolution_effort,due_at,latest_activity_at'
        )
        .eq('tenant_id', tenantId)
        .eq('business_id', tenantId)
        .not('status', 'in', '("completed","cancelled")')
        .order('latest_activity_at', { ascending: false })
        .limit(750),
      looseDb
        .from('van_damage_cases')
        .select(
          'id,tenant_id,business_id,van_id,lifecycle_status,current_severity,max_observed_severity,effective_severity,needs_review,latest_observed_inspection_id,latest_evidence_image_id,first_detected_inspection_id,first_upload_session_id,first_evidence_image_id,first_reporter_snapshot,first_source_timestamp,first_source_timestamp_kind,latest_uploader_snapshot,last_observed_at'
        )
        .eq('tenant_id', tenantId)
        .eq('business_id', tenantId)
        .order('last_observed_at', { ascending: false })
        .limit(750),
      db
        .from('van_damage_inspections')
        .select('id,tenant_id,business_id,van_id,status,created_at,completed_at')
        .eq('tenant_id', tenantId)
        .eq('business_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1000),
      db
        .from('van_damage_ai_runs')
        .select('inspection_id,tenant_id,status,completed_at')
        .eq('tenant_id', tenantId)
        .eq('business_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1000),
      looseDb
        .from('van_damage_images')
        .select(
          'id,image_role,created_at,upload_order,original_file_index,van_damage_inspections!inner(van_id)'
        )
        .eq('tenant_id', tenantId)
        .eq('business_id', tenantId)
        .in('status', ['uploaded', 'analyzed'])
        .order('created_at', { ascending: false })
        .limit(1500),
    ])

  const imageCandidatesByVan = new Map<string, VehicleImageCandidate[]>()
  for (const rawImage of (imageResult.data ?? []) as Array<Record<string, unknown>>) {
    const relation = rawImage.van_damage_inspections
    const inspection = Array.isArray(relation) ? asRecord(relation[0]) : asRecord(relation)
    const vanId = typeof inspection.van_id === 'string' ? inspection.van_id : null
    const id = typeof rawImage.id === 'string' ? rawImage.id : null
    const createdAt = typeof rawImage.created_at === 'string' ? rawImage.created_at : null
    if (!vanId || !id || !createdAt) continue
    const current = imageCandidatesByVan.get(vanId) ?? []
    current.push({
      id,
      imageRole: typeof rawImage.image_role === 'string' ? rawImage.image_role : null,
      createdAt,
      uploadOrder: typeof rawImage.upload_order === 'number' ? rawImage.upload_order : null,
      originalFileIndex:
        typeof rawImage.original_file_index === 'number' ? rawImage.original_file_index : null,
    })
    imageCandidatesByVan.set(vanId, current)
  }
  const vehicles = ((vehiclesResult.data ?? []) as Array<FleetVehicleRow>).map((vehicle) => {
    const metadata = asRecord(vehicle.metadata)
    const profileImage = selectVehicleProfileImage(
      metadata,
      imageCandidatesByVan.get(vehicle.id) ?? [],
      { allowAutomaticFirstUpload: false }
    )
    return {
      ...vehicle,
      metadata,
      profileImageId: profileImage.imageId,
    }
  }) as FleetVehicleRow[]
  const damageCases = (damageCasesResult.data ?? []) as Array<Record<string, unknown>>
  const attention = (attentionResult.data ?? []).map((item) => {
    const damageCase = damageCases.find((candidate) => candidate.id === item.latest_damage_case_id)
    return {
      ...item,
      vehicle_metadata: asRecord(item.vehicle_metadata),
      latest_driver: asRecord(item.latest_driver),
      first_reporter: asRecord(damageCase?.first_reporter_snapshot),
      first_inspection_id:
        typeof damageCase?.first_detected_inspection_id === 'string'
          ? damageCase.first_detected_inspection_id
          : null,
      first_upload_session_id:
        typeof damageCase?.first_upload_session_id === 'string'
          ? damageCase.first_upload_session_id
          : null,
      first_evidence_image_id:
        typeof damageCase?.first_evidence_image_id === 'string'
          ? damageCase.first_evidence_image_id
          : null,
      first_source_timestamp:
        typeof damageCase?.first_source_timestamp === 'string'
          ? damageCase.first_source_timestamp
          : null,
      first_source_timestamp_kind:
        typeof damageCase?.first_source_timestamp_kind === 'string'
          ? damageCase.first_source_timestamp_kind
          : null,
      latest_uploader: asRecord(damageCase?.latest_uploader_snapshot),
    }
  }) as FleetAttentionRow[]
  const maintenanceRows = (maintenanceResult.data ?? []) as MaintenanceRawRow[]
  const maintenance = Object.values(
    maintenanceRows.reduce<
      Record<
        string,
        {
          vanId: string
          activeCount: number
          urgentCount: number
          highCount: number
          quickFixCount: number
          appointmentCount: number
          needsAttention: boolean
          topItems: Array<{ id: string; title: string; priority: string; status: string }>
        }
      >
    >((groups, item) => {
      if (!item.van_id) return groups
      const group = groups[item.van_id] ?? {
        vanId: item.van_id,
        activeCount: 0,
        urgentCount: 0,
        highCount: 0,
        quickFixCount: 0,
        appointmentCount: 0,
        needsAttention: false,
        topItems: [],
      }
      group.activeCount += 1
      if (item.effective_priority === 'urgent') group.urgentCount += 1
      if (item.effective_priority === 'high') group.highCount += 1
      if (item.resolution_effort === 'quick_fix') group.quickFixCount += 1
      if (
        item.resolution_effort === 'appointment_required' ||
        item.resolution_effort === 'repair_shop_required'
      )
        group.appointmentCount += 1
      group.needsAttention ||=
        item.effective_priority === 'urgent' ||
        item.operational_impact === 'out_of_service' ||
        Boolean(
          item.due_at && Date.parse(item.due_at) < Date.now() && item.effective_priority === 'high'
        )
      if (group.topItems.length < 3)
        group.topItems.push({
          id: item.id,
          title: item.title,
          priority: item.effective_priority,
          status: item.status,
        })
      groups[item.van_id] = group
      return groups
    }, {})
  )
  const runByInspection = new Map<string, { status: string | null; completedAt: string | null }>(
    ((runResult.data ?? []) as RunRawRow[]).map((run) => [
      run.inspection_id,
      { status: run.status, completedAt: run.completed_at },
    ])
  )
  const fleetDamageCards = buildFleetDamageCards({
    tenantId,
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      van_number: vehicle.van_number,
      name: vehicle.name,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      plate_number: vehicle.plate_number,
      status: vehicle.status,
      profileImageId: vehicle.profileImageId,
    })),
    damageCases: damageCases as FleetDamageCaseInput[],
    analyses: ((inspectionResult.data ?? []) as InspectionRawRow[]).map((inspection) => {
      const run = runByInspection.get(inspection.id)
      return {
        tenant_id: inspection.tenant_id,
        van_id: inspection.van_id,
        inspection_id: inspection.id,
        inspection_status: inspection.status,
        completed_at: inspection.completed_at,
        created_at: inspection.created_at,
        run_status: run?.status ?? null,
        run_completed_at: run?.completedAt ?? null,
      }
    }) as FleetAnalysisInput[],
    maintenanceByVan: new Map(maintenance.map((item) => [item.vanId, item])),
  })

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Fleet operations"
        title="Fleet"
        description="Operational status, maintenance workload, and severe-damage attention in one tenant-scoped board."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/vehicles/maintenance?businessId=${encodeURIComponent(tenantId)}`}
              className="ui-button ui-button-primary"
            >
              <Wrench className="mr-2 h-4 w-4" />
              Fleet Maintenance
            </Link>
            <Link
              href={`/dashboard/vehicles/drivers?businessId=${encodeURIComponent(tenantId)}`}
              className="ui-button ui-button-secondary"
            >
              <UserRound className="mr-2 h-4 w-4" />
              Driver profiles
            </Link>
          </div>
        }
      />
      <FleetNeedsAttentionBoard
        tenantId={tenantId}
        timeZone={resolveInspectionTimeZone({ tenant: tenantResult.data })}
        canManage={['owner', 'admin'].includes(ctx.role)}
        vehicles={vehicles}
        attention={attention}
        maintenance={maintenance}
        fleetDamageCards={fleetDamageCards}
        fleetQuery={{
          q: stringParam(params.q),
          level: stringParam(params.level),
          age: stringParam(params.age),
          status: stringParam(params.fleetStatus),
          sort: stringParam(params.fleetSort),
        }}
        attentionError={
          attentionResult.error?.message ??
          vehiclesResult.error?.message ??
          maintenanceResult.error?.message ??
          null
        }
      />
    </div>
  )
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
