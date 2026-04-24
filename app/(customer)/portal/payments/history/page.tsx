// app/(customer)/portal/payments/history/page.tsx
import { headers } from 'next/headers'
import Link from 'next/link'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerTransactions } from '@/lib/payments/getCustomerTransactions'
import { CustomerPaymentHistory } from '@/components/payments/CustomerPaymentHistory'
import { ArrowLeft, Clock } from 'lucide-react'

export const metadata = { title: 'Payment History — Customer Portal' }

export default async function CustomerPaymentHistoryPage() {
  const host = headers().get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const transactions = await getCustomerTransactions(ctx.tenant_id, ctx.customer_id, 100)

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/portal/payments"
        className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Payments
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center">
          <Clock className="h-5 w-5 text-white/50" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Transaction History</h1>
          <p className="text-sm text-white/40">{transactions.length} transactions</p>
        </div>
      </div>

      <CustomerPaymentHistory transactions={transactions} />
    </div>
  )
}
