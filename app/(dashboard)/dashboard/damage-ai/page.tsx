export const dynamic = 'force-dynamic'

import { ScanLine, FileSearch, CheckCircle2, Clock } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Damage AI — ApexCRM' }

interface DamageAssessmentCounts {
  total:      number
  pending:    number
  completed:  number
}

async function getDamageCounts(tenantId: string): Promise<DamageAssessmentCounts> {
  try {
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from('damage_assessments')
      .select('status')
      .eq('tenant_id', tenantId)

    if (!data) return { total: 0, pending: 0, completed: 0 }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    return {
      total:     rows.length,
      pending:   rows.filter((d) => d.status === 'pending').length,
      completed: rows.filter((d) => d.status === 'completed').length,
    }
  } catch {
    return { total: 0, pending: 0, completed: 0 }
  }
}

export default async function DamageAIPage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!

  await guardModuleAccess(tenantId, 'damage_ai', ctx.role)

  const counts = await getDamageCounts(tenantId)

  const stats = [
    { label: 'Total',      value: counts.total,     icon: FileSearch,   color: 'text-sky-400',     bg: 'bg-sky-400/10'     },
    { label: 'Pending',    value: counts.pending,   icon: Clock,        color: 'text-amber-400',   bg: 'bg-amber-400/10'   },
    { label: 'Completed',  value: counts.completed, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  ]

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Damage AI</h1>
        <p className="text-sm text-white/40 mt-1">AI-powered damage assessment and analysis</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
        <ScanLine className="h-10 w-10 text-sky-400/60 mx-auto mb-3" />
        <p className="text-white/60 text-sm">
          {counts.total === 0
            ? 'No damage assessments yet. Upload images to begin AI analysis.'
            : `${counts.total} assessment${counts.total === 1 ? '' : 's'} — full AI interface coming soon.`}
        </p>
      </div>
    </div>
  )
}
