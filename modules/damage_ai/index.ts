import { ScanLine } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const damageAiModule: ModuleDefinition = {
  key: 'damage_ai',
  label: 'Van Damage AI',
  description: 'Slack-powered AI van damage inspections',
  icon: ScanLine,
  href: '/dashboard/damage-ai',
  color: 'text-rose-400',
  bgColor: 'bg-rose-400/10',
  order: 5,
  stats: [
    {
      key: 'damage_total', label: 'Inspections', category: 'operations', color: 'text-rose-400',
      emptyMessage: 'No inspections yet',
      async getValue(tenantId) {
        const { count } = await getSupabaseServerClient().from('van_damage_inspections')
          .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
    {
      key: 'damage_pending', label: 'Needs Review', category: 'operations', color: 'text-orange-400',
      emptyMessage: 'No inspections need review',
      async getValue(tenantId) {
        const { count } = await getSupabaseServerClient().from('van_damage_inspections')
          .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'needs_review')
        return count ?? 0
      },
    },
    {
      key: 'damage_completed', label: 'Completed', category: 'usage', color: 'text-emerald-400',
      emptyMessage: 'No completed inspections',
      async getValue(tenantId) {
        const { count } = await getSupabaseServerClient().from('van_damage_inspections')
          .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'completed')
        return count ?? 0
      },
    },
  ],
  async getStats(tenantId) {
    const { data } = await getSupabaseServerClient().from('van_damage_inspections').select('status').eq('tenant_id', tenantId)
    const rows = data ?? []
    return [
      { label: 'Inspections', value: rows.length },
      { label: 'Completed', value: rows.filter((row) => row.status === 'completed').length },
      { label: 'Needs Review', value: rows.filter((row) => row.status === 'needs_review').length },
    ]
  },
}
