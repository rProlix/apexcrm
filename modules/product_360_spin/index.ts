// modules/product_360_spin/index.ts
import { ScanLine }               from 'lucide-react'
import type { ModuleDefinition }  from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const product360SpinModule: ModuleDefinition = {
  key:         'product_360_spin',
  label:       '360 Product Spin',
  description: 'AI-powered 360° product spin generator with website builder drag-and-drop integration',
  icon:        ScanLine,
  href:        '/dashboard/360',
  color:       'text-fuchsia-400',
  bgColor:     'bg-fuchsia-400/10',
  order:       14,

  stats: [
    {
      key:          'p360_complete_packages',
      label:        'Complete Packages',
      category:     'usage',
      color:        'text-fuchsia-400',
      emptyMessage: 'No 360° packages yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('product_360_packages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'complete')
        return count ?? 0
      },
    },
    {
      key:          'p360_products_assigned',
      label:        'Products with 360°',
      category:     'usage',
      color:        'text-violet-400',
      emptyMessage: 'No products assigned',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .not('p360_package_id', 'is', null)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const [{ count: complete }, { count: assigned }] = await Promise.all([
      supabase
        .from('product_360_packages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'complete'),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('p360_package_id', 'is', null),
    ])
    return [
      { label: 'Complete Packages',  value: complete  ?? 0 },
      { label: 'Products with 360°', value: assigned  ?? 0 },
    ]
  },
}
