export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  FleetNeedsAttentionBoard,
  type FleetAttentionRow,
  type FleetVehicleRow,
} from '@/components/van-damage/FleetNeedsAttentionBoard'

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
  const [vehiclesResult, attentionResult] = await Promise.all([
    db
      .from('vehicles')
      .select('id, name, van_number, make, model, year, plate_number, status, metadata, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(250),
    db.rpc('get_fleet_needs_attention', { p_tenant_id: tenantId, p_business_id: tenantId }),
  ])

  const vehicles = (vehiclesResult.data ?? []).map((vehicle) => ({
    ...vehicle,
    metadata: asRecord(vehicle.metadata),
  })) as FleetVehicleRow[]
  const attention = (attentionResult.data ?? []).map((item) => ({
    ...item,
    vehicle_metadata: asRecord(item.vehicle_metadata),
    latest_driver: asRecord(item.latest_driver),
  })) as FleetAttentionRow[]

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
        <Link
          href={`/dashboard/vehicles/drivers?businessId=${encodeURIComponent(tenantId)}`}
          className="focus-ring inline-flex items-center rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm text-white/65 transition hover:border-gold-400/30 hover:text-white"
        >
          <UserRound className="mr-2 h-4 w-4" />
          Driver profiles
        </Link>
      </header>
      <FleetNeedsAttentionBoard
        tenantId={tenantId}
        canManage={['owner', 'admin'].includes(ctx.role)}
        vehicles={vehicles}
        attention={attention}
        attentionError={attentionResult.error?.message ?? vehiclesResult.error?.message ?? null}
      />
    </div>
  )
}
