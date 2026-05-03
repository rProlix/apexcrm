// modules/product_360_spin/index.ts
import { Rotate3D }               from 'lucide-react'
import type { ModuleDefinition }  from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const product360SpinModule: ModuleDefinition = {
  key:         'product_360_spin',
  label:       '360 Product Viewer',
  description: 'Create interactive 360° product viewers — AI-generated or manually uploaded frames. Drag to spin on storefront.',
  icon:        Rotate3D,
  href:        '/dashboard/360',
  color:       'text-fuchsia-400',
  bgColor:     'bg-fuchsia-400/10',
  order:       12,

  stats: [
    {
      key:          'p360_ready_packages',
      label:        'Ready Packages',
      category:     'usage',
      color:        'text-fuchsia-400',
      emptyMessage: 'No 360° packages yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (supabase as any)
          .from('product_360_packages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'ready')
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
          .not('spin_package_id', 'is', null)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const [{ count: ready }, { count: assigned }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('product_360_packages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ready'),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('spin_package_id', 'is', null),
    ])
    return [
      { label: 'Ready Packages',     value: ready    ?? 0 },
      { label: 'Products with 360°', value: assigned ?? 0 },
    ]
  },
}
