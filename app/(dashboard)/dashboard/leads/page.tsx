export const dynamic = 'force-dynamic'

import { UserPlus, TrendingUp, Star, Users } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Leads — ApexCRM' }

interface LeadCounts {
  total:     number
  new:       number
  qualified: number
  converted: number
}

async function getLeadCounts(tenantId: string): Promise<LeadCounts> {
  try {
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('leads').select('status').eq('tenant_id', tenantId)

    if (!data) return { total: 0, new: 0, qualified: 0, converted: 0 }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    return {
      total:     rows.length,
      new:       rows.filter((l) => l.status === 'new').length,
      qualified: rows.filter((l) => l.status === 'qualified').length,
      converted: rows.filter((l) => l.status === 'converted').length,
    }
  } catch {
    return { total: 0, new: 0, qualified: 0, converted: 0 }
  }
}

export default async function LeadsPage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!

  await guardModuleAccess(tenantId, 'leads', ctx.role)

  const counts = await getLeadCounts(tenantId)

  const stats = [
    { label: 'Total Leads',  value: counts.total,     icon: Users,      color: 'text-indigo-400',  bg: 'bg-indigo-400/10' },
    { label: 'New',          value: counts.new,        icon: UserPlus,   color: 'text-purple-400',  bg: 'bg-purple-400/10' },
    { label: 'Qualified',    value: counts.qualified,  icon: TrendingUp, color: 'text-violet-400',  bg: 'bg-violet-400/10' },
    { label: 'Converted',    value: counts.converted,  icon: Star,       color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  ]

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Leads</h1>
        <p className="text-sm text-white/40 mt-1">Track and convert incoming leads</p>
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
        <UserPlus className="h-10 w-10 text-purple-400/60 mx-auto mb-3" />
        <p className="text-white/60 text-sm">
          {counts.total === 0
            ? 'No leads yet. They will appear here once added.'
            : `${counts.total} lead${counts.total === 1 ? '' : 's'} — full lead management UI coming soon.`}
        </p>
      </div>
    </div>
  )
}
