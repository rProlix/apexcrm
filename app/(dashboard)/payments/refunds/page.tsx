export const dynamic = 'force-dynamic'

// app/(dashboard)/payments/refunds/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RefundForm } from '@/components/payments/RefundForm'

export const metadata = { title: 'Refunds — Payments' }

export default async function RefundsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any

  const [refundsResult, txResult] = await Promise.all([
    supabase
      .from('payment_refunds')
      .select('*, payment_transactions(provider_transaction_id, amount, currency, status)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payment_transactions')
      .select('id, provider_transaction_id, amount, currency, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'succeeded')
      .eq('transaction_type', 'charge')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return (
    <RefundForm
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialRefunds={(refundsResult.data ?? []) as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availableTransactions={(txResult.data ?? []) as any[]}
      tenantId={tenantId}
    />
  )
}
