// app/(dashboard)/payments/transactions/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { TransactionList } from '@/components/payments/TransactionList'

export const metadata = { title: 'Transactions — Payments' }

export default async function TransactionsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any

  const { data: transactions } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return (
    <TransactionList
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialTransactions={(transactions ?? []) as any[]}
      tenantId={tenantId}
    />
  )
}
