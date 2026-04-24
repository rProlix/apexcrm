import { ScanLine } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const damageAiModule: ModuleDefinition = {
  key:         'damage_ai',
  label:       'Damage AI',
  description: 'AI-powered vehicle damage assessment',
  icon:        ScanLine,
  href:        '/dashboard/damage-ai',
  color:       'text-rose-400',
  bgColor:     'bg-rose-400/10',
  order:       5,

  stats: [
    {
      key:      'damage_total',
      label:    'Assessments',
      category: 'operations',
      color:    'text-rose-400',
      emptyMessage: 'No assessments run',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('damage_assessments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
    {
      key:      'damage_pending',
      label:    'Pending Review',
      category: 'operations',
      color:    'text-orange-400',
      emptyMessage: 'No pending assessments',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('damage_assessments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'pending')
        return count ?? 0
      },
    },
    {
      key:      'damage_avg_score',
      label:    'Avg Damage Score',
      category: 'usage',
      color:    'text-pink-400',
      emptyMessage: 'No completed scans',
      format:   (v) => `${Number(v).toFixed(1)} / 10`,
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { data } = await supabase
          .from('damage_assessments')
          .select('score')
          .eq('tenant_id', tenantId)
          .eq('status', 'complete')
          .not('score', 'is', null)
        if (!data || data.length === 0) return 0
        const avg = data.reduce((sum, d) => sum + (d.score ?? 0), 0) / data.length
        return Math.round(avg * 10) / 10
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase
      .from('damage_assessments')
      .select('status, score')
      .eq('tenant_id', tenantId)

    if (!data) return []

    const completed = data.filter((d) => d.status === 'complete')
    const avgScore  = completed.length
      ? (completed.reduce((s, d) => s + (d.score ?? 0), 0) / completed.length).toFixed(1)
      : '—'

    return [
      { label: 'Assessments', value: data.length },
      { label: 'Complete',    value: completed.length },
      { label: 'Avg Score',   value: avgScore },
    ]
  },
}
