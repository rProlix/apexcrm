export const dynamic = 'force-dynamic'

import { Car, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react'
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

  const stats = [
    { label: 'Total',           value: counts.total,           icon: Car,           color: 'text-indigo-400',  bg: 'bg-indigo-400/10'  },
    { label: 'Active',          value: counts.active,          icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'In Service',      value: counts.inService,       icon: Wrench,        color: 'text-amber-400',   bg: 'bg-amber-400/10'   },
    { label: 'Needs Attention', value: counts.needsAttention,  icon: AlertTriangle, color: 'text-red-400',     bg: 'bg-red-400/10'     },
  ]

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Vehicles</h1>
        <p className="text-sm text-white/40 mt-1">Manage your vehicle fleet</p>
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

      <div className="rounded-xl bg-graphite-800 border border-graphite-600 p-8 text-center">
        <Car className="h-10 w-10 text-indigo-400/60 mx-auto mb-3" />
        <p className="text-white/60 text-sm">
          {counts.total === 0
            ? 'No vehicles yet. They will appear here once added.'
            : `${counts.total} vehicle${counts.total === 1 ? '' : 's'} — full fleet management UI coming soon.`}
        </p>
      </div>
    </div>
  )
}
