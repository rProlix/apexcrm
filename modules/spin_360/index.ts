// modules/spin_360/index.ts
import { RotateCcw }              from 'lucide-react'
import type { ModuleDefinition }  from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const spin360Module: ModuleDefinition = {
  key:         'spin_360',
  label:       '360° Spin',
  description: 'AI-powered 360° product viewer — canvas-based drag-to-rotate with Midjourney generation',
  icon:        RotateCcw,
  href:        '/dashboard/360-spins',
  color:       'text-violet-400',
  bgColor:     'bg-violet-400/10',
  order:       13,

  stats: [
    {
      key:          'spin_360_ready',
      label:        'Ready Spins',
      category:     'usage',
      color:        'text-violet-400',
      emptyMessage: 'No 360° spins yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('product_360_spins')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'ready')
        return count ?? 0
      },
    },
    {
      key:          'spin_360_assigned',
      label:        'Products with 360°',
      category:     'usage',
      color:        'text-fuchsia-400',
      emptyMessage: 'No products assigned',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .not('spin_360_id', 'is', null)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const [{ count: ready }, { count: assigned }] = await Promise.all([
      supabase
        .from('product_360_spins')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ready'),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('spin_360_id', 'is', null),
    ])
    return [
      { label: 'Ready Spins',        value: ready    ?? 0 },
      { label: 'Products with 360°', value: assigned ?? 0 },
    ]
  },
}
