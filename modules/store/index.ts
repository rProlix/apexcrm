// modules/store/index.ts
import { ShoppingBag } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const storeModule: ModuleDefinition = {
  key:         'store',
  label:       'Store',
  description: 'Ecommerce storefront — sell products directly to customers',
  icon:        ShoppingBag,
  href:        '/store/products',
  color:       'text-amber-400',
  bgColor:     'bg-amber-400/10',
  order:       9,

  stats: [
    {
      key:          'store_products',
      label:        'Products',
      category:     'usage',
      color:        'text-amber-400',
      emptyMessage: 'No products yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
        return count ?? 0
      },
    },
    {
      key:          'store_orders',
      label:        'Orders',
      category:     'operations',
      color:        'text-orange-400',
      emptyMessage: 'No orders yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
    {
      key:          'store_revenue',
      label:        'Revenue',
      category:     'financial',
      color:        'text-emerald-400',
      emptyMessage: 'No revenue yet',
      format:       (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { data } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('tenant_id', tenantId)
          .not('status', 'in', '(cancelled,refunded)')
        const total = (data ?? []).reduce(
          (sum, row) => sum + (Number(row.total_amount) || 0),
          0
        )
        return total
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()

    const [{ count: products }, { count: orders }, { data: orderRows }] =
      await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('orders')
          .select('total_amount')
          .eq('tenant_id', tenantId)
          .not('status', 'in', '(cancelled,refunded)'),
      ])

    const revenue = (orderRows ?? []).reduce(
      (sum, row) => sum + (Number(row.total_amount) || 0),
      0
    )

    return [
      { label: 'Products', value: products ?? 0 },
      { label: 'Orders',   value: orders ?? 0 },
      { label: 'Revenue',  value: `$${revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    ]
  },
}
