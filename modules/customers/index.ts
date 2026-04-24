// modules/customers/index.ts
import { Users } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const customersModule: ModuleDefinition = {
  key:         'customers',
  label:       'Customers',
  description: 'Tenant-scoped customer profiles, orders, payments, and activity',
  icon:        Users,
  href:        '/customers',
  color:       'text-cyan-400',
  bgColor:     'bg-cyan-400/10',
  order:       3,

  stats: [
    {
      key:          'customers_total',
      label:        'Total Customers',
      category:     'usage',
      color:        'text-cyan-400',
      emptyMessage: 'No customers yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
    {
      key:          'customers_active',
      label:        'Active Customers',
      category:     'usage',
      color:        'text-emerald-400',
      emptyMessage: 'No active customers',
      async getValue(tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseServerClient() as any
        const { count } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
        return count ?? 0
      },
    },
    {
      key:          'customers_orders',
      label:        'Total Orders',
      category:     'operations',
      color:        'text-amber-400',
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
      key:          'customers_payments',
      label:        'Payments',
      category:     'financial',
      color:        'text-gold-400',
      emptyMessage: 'No payments yet',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async getValue(tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseServerClient() as any
        const { count } = await supabase
          .from('payment_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'succeeded')
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()

    const [{ count: total }, { count: active }, { count: orders }] =
      await Promise.all([
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
      ])

    return [
      { label: 'Total Customers', value: total ?? 0 },
      { label: 'Active',          value: active ?? 0 },
      { label: 'Total Orders',    value: orders ?? 0 },
    ]
  },
}
