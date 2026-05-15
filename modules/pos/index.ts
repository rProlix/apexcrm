// modules/pos/index.ts
import { ShoppingCart } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export const posModule: ModuleDefinition = {
  key:         'pos',
  label:       'Point of Sale',
  description: 'Create in-person orders, customize items, collect payments, manage tickets, and sync sales with inventory.',
  icon:        ShoppingCart,
  href:        '/pos',
  color:       'text-violet-400',
  bgColor:     'bg-violet-400/10',
  order:       14,

  stats: [
    {
      key:          'pos_sales_today',
      label:        'Sales Today',
      category:     'financial',
      color:        'text-violet-400',
      emptyMessage: 'No sales today yet',
      format:       (v) => `$${(Number(v) / 100).toFixed(2)}`,
      async getValue(tenantId) {
        const supabase = getPOSClient()
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { data } = await supabase
          .from('pos_orders')
          .select('total_cents')
          .eq('tenant_id', tenantId)
          .eq('payment_status', 'paid')
          .gte('created_at', today.toISOString())
        return (data ?? []).reduce((s: number, r: { total_cents: number }) => s + r.total_cents, 0)
      },
    },
    {
      key:          'pos_open_orders',
      label:        'Open Orders',
      category:     'operations',
      color:        'text-yellow-400',
      emptyMessage: 'No open orders',
      async getValue(tenantId) {
        const supabase = getPOSClient()
        const { count } = await supabase
          .from('pos_orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ['open', 'sent_to_kitchen', 'preparing'])
        return count ?? 0
      },
    },
    {
      key:          'pos_orders_today',
      label:        'Orders Today',
      category:     'usage',
      color:        'text-teal-400',
      emptyMessage: 'No orders today',
      async getValue(tenantId) {
        const supabase = getPOSClient()
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { count } = await supabase
          .from('pos_orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', today.toISOString())
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getPOSClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [{ data: orders }, { count: openCount }] = await Promise.all([
      supabase
        .from('pos_orders')
        .select('total_cents, payment_status')
        .eq('tenant_id', tenantId)
        .gte('created_at', today.toISOString()),
      supabase
        .from('pos_orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['open', 'sent_to_kitchen', 'preparing']),
    ])

    const todaySales = (orders ?? [])
      .filter((o: { payment_status: string }) => o.payment_status === 'paid')
      .reduce((s: number, o: { total_cents: number }) => s + o.total_cents, 0)

    return [
      { label: 'Sales Today', value: `$${(todaySales / 100).toFixed(2)}` },
      { label: 'Open Orders', value: openCount ?? 0 },
      { label: 'Orders Today', value: (orders ?? []).length },
    ]
  },
}
