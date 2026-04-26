export const dynamic = 'force-dynamic'

// app/(dashboard)/payments/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getTenantRevenue, getDailyRevenue } from '@/lib/payments/getTenantRevenue'
import { getPaymentSettings } from '@/lib/payments/getPaymentSettings'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { PaymentsDashboard } from '@/components/payments/PaymentsDashboard'

export const metadata = { title: 'Payments — Dashboard' }

export default async function PaymentsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const [revenue, dailyRevenue, settings, recentTxResult, providersResult] = await Promise.all([
    getTenantRevenue(tenantId),
    getDailyRevenue(tenantId, 30),
    getPaymentSettings(tenantId),
    supabase
      .from('payment_transactions')
      .select('id, amount, currency, status, transaction_type, provider_key, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('payment_providers')
      .select('id, provider_key, is_enabled, is_default, created_at')
      .eq('tenant_id', tenantId),
  ])

  return (
    <PaymentsDashboard
      revenue={revenue}
      dailyRevenue={dailyRevenue}
      currency={settings.currency}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentTransactions={(recentTxResult.data ?? []) as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providers={(providersResult.data ?? []) as any[]}
      tenantId={tenantId}
    />
  )
}
