// modules/inventory/index.ts
import { Package } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'

export const inventoryModule: ModuleDefinition = {
  key:         'inventory',
  label:       'Inventory',
  description: 'Track stock, supplies, barcode scans, sales trends, low-stock alerts, and predictive restocking.',
  icon:        Package,
  href:        '/inventory',
  color:       'text-teal-400',
  bgColor:     'bg-teal-400/10',
  order:       13,

  stats: [
    {
      key:          'inventory_items',
      label:        'Items',
      category:     'usage',
      color:        'text-teal-400',
      emptyMessage: 'No items tracked yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('inventory_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
        return count ?? 0
      },
    },
    {
      key:          'inventory_low_stock',
      label:        'Low Stock',
      category:     'operations',
      color:        'text-orange-400',
      emptyMessage: 'All stock levels OK',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { data } = await supabase
          .from('inventory_items')
          .select('id, current_quantity, reorder_point')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
        const lowStock = (data ?? []).filter(
          (item: { current_quantity: number; reorder_point: number }) =>
            item.current_quantity <= item.reorder_point && item.current_quantity > 0
        )
        return lowStock.length
      },
    },
    {
      key:          'inventory_alerts',
      label:        'Open Alerts',
      category:     'operations',
      color:        'text-red-400',
      emptyMessage: 'No open alerts',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('inventory_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ['open', 'acknowledged'])
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()

    const [{ count: items }, { count: alerts }, { data: allItems }] = await Promise.all([
      supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      supabase
        .from('inventory_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['open', 'acknowledged']),
      supabase
        .from('inventory_items')
        .select('id, current_quantity, reorder_point')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
    ])

    const lowStock = (allItems ?? []).filter(
      (item: { current_quantity: number; reorder_point: number }) =>
        item.current_quantity <= item.reorder_point && item.current_quantity > 0
    ).length

    return [
      { label: 'Items',       value: items ?? 0 },
      { label: 'Low Stock',   value: lowStock },
      { label: 'Open Alerts', value: alerts ?? 0 },
    ]
  },
}
