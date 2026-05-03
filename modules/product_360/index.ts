// modules/product_360/index.ts
import { Rotate3D }                from 'lucide-react'
import type { ModuleDefinition }   from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const product360Module: ModuleDefinition = {
  key:         'product_360',
  label:       '360 Product Studio',
  description: 'Create interactive 360° product viewers — AI-generated or manually uploaded. Drag to spin on the storefront. Supports multiple packages per product, promo scheduling, hotspots, and AR.',
  icon:        Rotate3D,
  href:        '/dashboard/product-360',
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
      key:          'p360_enabled_packages',
      label:        'Live on Storefront',
      category:     'usage',
      color:        'text-emerald-400',
      emptyMessage: 'None enabled',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (supabase as any)
          .from('product_360_packages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'ready')
          .eq('is_enabled', true)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const [{ count: ready }, { count: enabled }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('product_360_packages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ready'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('product_360_packages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ready')
        .eq('is_enabled', true),
    ])
    return [
      { label: 'Ready Packages',     value: ready   ?? 0 },
      { label: 'Live on Storefront', value: enabled ?? 0 },
    ]
  },
}
