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

export const metadata = { title: 'Fleet — NexoraNow' }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export default async function VehiclesPage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!
  await guardModuleAccess(tenantId, 'vehicles', ctx.role)

  const db = getSupabaseServerClient()
  const looseDb = db as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          eq: (
            column: string,
            value: string
          ) => {
            order: (
              column: string,
              options: { ascending: boolean }
            ) => {
              limit: (
                count: number
              ) => Promise<{ data: unknown[] | null; error?: { message: string } | null }>
            }
          }
        }
      }
    }
  }
  const [vehiclesResult, attentionResult, tenantResult, maintenanceResult, damageCasesResult] =
    await Promise.all([
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
          'id,van_id,first_detected_inspection_id,first_upload_session_id,first_evidence_image_id,first_reporter_snapshot,first_source_timestamp,first_source_timestamp_kind,latest_uploader_snapshot,last_observed_at'
        )
        .eq('tenant_id', tenantId)
        .eq('business_id', tenantId)
        .order('last_observed_at', { ascending: false })
        .limit(750),
    ])

  const vehicles = (vehiclesResult.data ?? []).map((vehicle) => ({
    ...vehicle,
    metadata: asRecord(vehicle.metadata),
  })) as FleetVehicleRow[]
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
  const maintenance = Object.values(
    (maintenanceResult.data ?? []).reduce<
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

  return (
    <div className="space-y-8 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[.18em] text-gold-300/65">
            Fleet operations
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Fleet</h1>
          <p className="mt-1 text-sm text-white/40">
            Operational status and severe-damage attention in one tenant-scoped board.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/vehicles/maintenance?businessId=${encodeURIComponent(tenantId)}`}
            className="focus-ring inline-flex items-center rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-graphite-950 transition hover:bg-amber-200"
          >
            <Wrench className="mr-2 h-4 w-4" />
            Fleet Maintenance
          </Link>
          <Link
            href={`/dashboard/vehicles/drivers?businessId=${encodeURIComponent(tenantId)}`}
            className="focus-ring inline-flex items-center rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm text-white/65 transition hover:border-gold-400/30 hover:text-white"
          >
            <UserRound className="mr-2 h-4 w-4" />
            Driver profiles
          </Link>
        </div>
      </header>
      <FleetNeedsAttentionBoard
        tenantId={tenantId}
        timeZone={resolveInspectionTimeZone({ tenant: tenantResult.data })}
        canManage={['owner', 'admin'].includes(ctx.role)}
        vehicles={vehicles}
        attention={attention}
        maintenance={maintenance}
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
