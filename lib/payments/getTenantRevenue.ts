// lib/payments/getTenantRevenue.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface RevenueStats {
  totalRevenue:     number
  monthRevenue:     number
  weekRevenue:      number
  pendingAmount:    number
  failedCount:      number
  refundedAmount:   number
  transactionCount: number
  currency:         string
}

export interface DailyRevenue {
  date:    string
  amount:  number
  count:   number
}

/**
 * Aggregates revenue stats for a single tenant.
 * Always filters by tenant_id — never mixes tenant data.
 */
export async function getTenantRevenue(tenantId: string): Promise<RevenueStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const now       = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const weekStart  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [txResult, refundResult, invoiceResult] = await Promise.all([
    supabase
      .from('payment_transactions')
      .select('amount, currency, status, created_at, transaction_type')
      .eq('tenant_id', tenantId)
      .eq('transaction_type', 'charge'),

    supabase
      .from('payment_refunds')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'succeeded'),

    supabase
      .from('invoices')
      .select('amount, status, currency')
      .eq('tenant_id', tenantId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions = (txResult.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refunds      = (refundResult.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices     = (invoiceResult.data ?? []) as any[]

  const succeeded = transactions.filter((t: any) => t.status === 'succeeded')

  const totalRevenue   = succeeded.reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthRevenue   = succeeded
    .filter((t: any) => t.created_at >= monthStart)
    .reduce((s: number, t: any) => s + Number(t.amount), 0)
  const weekRevenue    = succeeded
    .filter((t: any) => t.created_at >= weekStart)
    .reduce((s: number, t: any) => s + Number(t.amount), 0)
  const pendingAmount  = invoices
    .filter((i: any) => i.status === 'pending')
    .reduce((s: number, i: any) => s + Number(i.amount), 0)
  const failedCount    = transactions.filter((t: any) => t.status === 'failed').length
  const refundedAmount = refunds.reduce((s: number, r: any) => s + Number(r.amount), 0)
  const currency       = succeeded[0]?.currency ?? invoices[0]?.currency ?? 'USD'

  return {
    totalRevenue,
    monthRevenue,
    weekRevenue,
    pendingAmount,
    failedCount,
    refundedAmount,
    transactionCount: succeeded.length,
    currency,
  }
}

/**
 * Returns daily revenue for the last N days for a tenant (for charts).
 */
export async function getDailyRevenue(
  tenantId: string,
  days:     number = 30
): Promise<DailyRevenue[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('payment_transactions')
    .select('amount, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'succeeded')
    .eq('transaction_type', 'charge')
    .gte('created_at', since)
    .order('created_at')

  const byDay: Record<string, { amount: number; count: number }> = {}

  for (const tx of data ?? []) {
    const date = tx.created_at.slice(0, 10)
    if (!byDay[date]) byDay[date] = { amount: 0, count: 0 }
    byDay[date].amount += Number(tx.amount)
    byDay[date].count  += 1
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, amount: v.amount, count: v.count }))
}
