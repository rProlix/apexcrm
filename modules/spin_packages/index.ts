// modules/spin_packages/index.ts
import { RotateCcw }              from 'lucide-react'
import type { ModuleDefinition }  from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const spinPackagesModule: ModuleDefinition = {
  key:         'spin_packages',
  label:       '360 Spin',
  description: 'AI-generated 360° product spin viewer using Midjourney',
  icon:        RotateCcw,
  href:        '/owner/spin-generator',
  color:       'text-indigo-400',
  bgColor:     'bg-indigo-400/10',
  order:       12,

  stats: [
    {
      key:          'spin_packages_ready',
      label:        'Ready Packages',
      category:     'usage',
      color:        'text-indigo-400',
      emptyMessage: 'No spin packages yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('spin_packages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'ready')
        return count ?? 0
      },
    },
    {
      key:          'spin_packages_total',
      label:        'Total Frames',
      category:     'usage',
      color:        'text-violet-400',
      emptyMessage: 'No frames generated',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('spin_images')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const [{ count: ready }, { count: frames }] = await Promise.all([
      supabase
        .from('spin_packages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ready'),
      supabase
        .from('spin_images')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ])
    return [
      { label: 'Ready Packages', value: ready  ?? 0 },
      { label: 'Total Frames',   value: frames ?? 0 },
    ]
  },
}
