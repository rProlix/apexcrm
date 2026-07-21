export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Car, Wrench, CheckCircle2, AlertTriangle, ArrowRight, UserRound } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Vehicles — ApexCRM' }

interface VehicleCounts {
  total:       number
  active:      number
  inService:   number
  needsAttention: number
}

async function getVehicleCounts(tenantId: string): Promise<VehicleCounts> {
  try {
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('vehicles').select('status').eq('tenant_id', tenantId)

    if (!data) return { total: 0, active: 0, inService: 0, needsAttention: 0 }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    return {
      total:          rows.length,
      active:         rows.filter((v) => v.status === 'active').length,
      inService:      rows.filter((v) => v.status === 'in_service').length,
      needsAttention: rows.filter((v) => v.status === 'needs_attention').length,
    }
  } catch {
    return { total: 0, active: 0, inService: 0, needsAttention: 0 }
  }
}

export default async function VehiclesPage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!

  await guardModuleAccess(tenantId, 'vehicles', ctx.role)

  const counts = await getVehicleCounts(tenantId)
  const db = getSupabaseServerClient()
  const { data: vehicles } = await db.from('vehicles')
    .select('id, name, van_number, make, model, year, plate_number, status, metadata, updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(48)

  const stats = [
    { label: 'Total',           value: counts.total,           icon: Car,           color: 'text-indigo-400',  bg: 'bg-indigo-400/10'  },
    { label: 'Active',          value: counts.active,          icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'In Service',      value: counts.inService,       icon: Wrench,        color: 'text-amber-400',   bg: 'bg-amber-400/10'   },
    { label: 'Needs Attention', value: counts.needsAttention,  icon: AlertTriangle, color: 'text-red-400',     bg: 'bg-red-400/10'     },
  ]

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehicles</h1>
          <p className="text-sm text-white/40 mt-1">Manage your vehicle fleet</p>
        </div>
        <Link href={`/dashboard/vehicles/drivers?businessId=${encodeURIComponent(tenantId)}`} className="focus-ring inline-flex items-center rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm text-white/65 transition hover:border-gold-400/30 hover:text-white">
          <UserRound className="mr-2 h-4 w-4" />Driver profiles
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl bg-graphite-800 border border-graphite-600 p-4">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-white/40 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {vehicles?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((vehicle) => {
          const meta = vehicle.metadata && typeof vehicle.metadata === 'object' && !Array.isArray(vehicle.metadata)
            ? vehicle.metadata as Record<string, unknown>
            : {}
          const vanDamage = meta.vanDamage && typeof meta.vanDamage === 'object' && !Array.isArray(meta.vanDamage)
            ? meta.vanDamage as Record<string, unknown>
            : {}
          const activeCaseCount = typeof vanDamage.activeCaseCount === 'number' ? vanDamage.activeCaseCount : 0
          return <Link key={vehicle.id} href={`/dashboard/vehicles/${vehicle.id}?businessId=${encodeURIComponent(tenantId)}`} className="focus-ring group rounded-xl bg-graphite-800 border border-graphite-600 p-5 transition hover:border-gold-400/30 hover:bg-graphite-700">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[.16em] text-white/30">{vehicle.van_number ? `Van ${vehicle.van_number}` : 'Vehicle'}</p>
                <h2 className="mt-2 font-semibold text-white">{vehicle.name}</h2>
                <p className="mt-1 text-xs text-white/40">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.plate_number || 'Details unavailable'}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-1 group-hover:text-gold-300" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/5 px-2.5 py-1 capitalize text-white/45">{vehicle.status}</span>
              <span className={`rounded-full px-2.5 py-1 ${activeCaseCount > 0 ? 'bg-red-400/10 text-red-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{activeCaseCount} active damage</span>
            </div>
          </Link>
        })}
      </div> : <div className="rounded-xl bg-graphite-800 border border-graphite-600 p-8 text-center">
        <Car className="h-10 w-10 text-indigo-400/60 mx-auto mb-3" />
        <p className="text-white/60 text-sm">No vehicles yet. They will appear here once added.</p>
      </div>}
    </div>
  )
}
