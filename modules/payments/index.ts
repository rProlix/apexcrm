// modules/payments/index.ts
import { CreditCard } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const paymentsModule: ModuleDefinition = {
  key:         'payments',
  label:       'Payments',
  description: 'Invoices, transactions, revenue tracking, Stripe & Square',
  icon:        CreditCard,
  href:        '/payments',
  color:       'text-gold-400',
  bgColor:     'bg-gold-400/10',
  order:       1,

  stats: [
    {
      key:          'payments_revenue_month',
      label:        'Monthly Revenue',
      category:     'financial',
      color:        'text-gold-400',
      emptyMessage: 'No revenue this month',
      format:       (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      async getValue(tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase   = getSupabaseServerClient() as any
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)

        const { data } = await supabase
          .from('payment_transactions')
          .select('amount')
          .eq('tenant_id', tenantId)
          .eq('status', 'succeeded')
          .eq('transaction_type', 'charge')
          .gte('created_at', monthStart.toISOString())

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = (data ?? [] as any[]).reduce((sum: number, t: any) => sum + Number(t.amount), 0)
        return total
      },
    },
    {
      key:          'payments_pending',
      label:        'Pending Invoices',
      category:     'operations',
      color:        'text-yellow-400',
      emptyMessage: 'No pending invoices',
      async getValue(tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseServerClient() as any
        const { count } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'pending')
        return count ?? 0
      },
    },
    {
      key:          'payments_failed',
      label:        'Failed Payments',
      category:     'operations',
      color:        'text-red-400',
      emptyMessage: 'No failed payments',
      async getValue(tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseServerClient() as any
        const { count } = await supabase
          .from('payment_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'failed')
        return count ?? 0
      },
    },
    {
      key:          'payments_refunded',
      label:        'Refunded',
      category:     'financial',
      color:        'text-orange-400',
      emptyMessage: 'No refunds',
      format:       (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      async getValue(tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabaseServerClient() as any
        const { data } = await supabase
          .from('payment_refunds')
          .select('amount')
          .eq('tenant_id', tenantId)
          .eq('status', 'succeeded')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data ?? []).reduce((sum: number, r: any) => sum + Number(r.amount), 0)
      },
    },
  ],

  async getStats(tenantId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any

    const [txResult, invoiceResult, refundResult] = await Promise.all([
      supabase
        .from('payment_transactions')
        .select('amount, status')
        .eq('tenant_id', tenantId),
      supabase
        .from('invoices')
        .select('amount, status')
        .eq('tenant_id', tenantId),
      supabase
        .from('payment_refunds')
        .select('amount')
        .eq('tenant_id', tenantId)
        .eq('status', 'succeeded'),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions = (txResult.data ?? []) as any[]
    const revenue = transactions
      .filter((t: any) => t.status === 'succeeded')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoices = (invoiceResult.data ?? []) as any[]
    const pending  = invoices.filter((i: any) => i.status === 'pending').length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refunded = (refundResult.data ?? [] as any[]).reduce((sum: number, r: any) => sum + Number(r.amount), 0)

    return [
      { label: 'Total Revenue', value: `$${revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Pending',       value: pending },
      { label: 'Refunded',      value: `$${refunded.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    ]
  },
}
