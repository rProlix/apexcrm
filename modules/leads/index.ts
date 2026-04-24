import { UserPlus } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const leadsModule: ModuleDefinition = {
  key:         'leads',
  label:       'Leads',
  description: 'Track and convert incoming leads',
  icon:        UserPlus,
  href:        '/dashboard/leads',
  color:       'text-purple-400',
  bgColor:     'bg-purple-400/10',
  order:       6,

  stats: [
    {
      key:      'leads_new',
      label:    'New Leads',
      category: 'operations',
      color:    'text-purple-400',
      emptyMessage: 'No new leads',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'new')
        return count ?? 0
      },
    },
    {
      key:      'leads_qualified',
      label:    'Qualified',
      category: 'operations',
      color:    'text-violet-400',
      emptyMessage: 'No qualified leads',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'qualified')
        return count ?? 0
      },
    },
    {
      key:      'leads_converted',
      label:    'Converted',
      category: 'financial',
      color:    'text-emerald-400',
      emptyMessage: 'No converted leads yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'converted')
        return count ?? 0
      },
    },
    {
      key:      'leads_total',
      label:    'Total Leads',
      category: 'usage',
      color:    'text-indigo-400',
      emptyMessage: 'No leads yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase
      .from('leads')
      .select('status')
      .eq('tenant_id', tenantId)

    if (!data) return []

    return [
      { label: 'Total',     value: data.length },
      { label: 'New',       value: data.filter((l) => l.status === 'new').length },
      { label: 'Qualified', value: data.filter((l) => l.status === 'qualified').length },
    ]
  },
}
