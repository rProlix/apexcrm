// app/(customer)/portal/customers/payments/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerPayments } from '@/lib/customers/getCustomerPayments'
import Link from 'next/link'
import { ArrowLeft, CreditCard, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

const TX_STATUS: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  succeeded: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed:    'text-red-400 bg-red-400/10 border-red-400/20',
  refunded:  'text-orange-400 bg-orange-400/10 border-orange-400/20',
  canceled:  'text-white/30 bg-white/4 border-white/8',
}

const INV_STATUS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  paid:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  overdue: 'text-red-400 bg-red-400/10 border-red-400/20',
  draft:   'text-white/30 bg-white/4 border-white/8',
}

export default async function CustomerPortalPaymentsPage() {
  const host = (await headers()).get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const { transactions, invoices } = await getCustomerPayments(ctx.tenant_id, ctx.customer_id, 100)

  const totalPaid = transactions
    .filter(t => t.status === 'succeeded')
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-6">
      <Link
        href="/portal/customers"
        className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to account
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Payments</h1>
        <p className="text-sm text-white/40 mt-1">Total paid: ${totalPaid.toFixed(2)}</p>
      </div>

      {/* Transactions */}
      <section>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          Transactions ({transactions.length})
        </h2>
        {transactions.length === 0 ? (
          <div className="premium-panel premium-border rounded-2xl py-8 flex flex-col items-center gap-3">
            <CreditCard className="w-7 h-7 text-white/20" />
            <p className="text-sm text-white/30">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="premium-panel premium-border rounded-xl flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-white/80 capitalize">{tx.transaction_type}</p>
                  <p className="text-xs text-white/30">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TX_STATUS[tx.status] ?? 'text-white/30 border-white/8 bg-white/4'}`}>
                    {tx.status}
                  </span>
                  <span className="text-sm font-bold text-white">${tx.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Invoices */}
      <section>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          Invoices ({invoices.length})
        </h2>
        {invoices.length === 0 ? (
          <div className="premium-panel premium-border rounded-2xl py-8 flex flex-col items-center gap-3">
            <FileText className="w-7 h-7 text-white/20" />
            <p className="text-sm text-white/30">No invoices yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="premium-panel premium-border rounded-xl flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-white/80">{inv.title}</p>
                  <p className="text-xs text-white/30">#{inv.invoice_number} · {new Date(inv.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${INV_STATUS[inv.status] ?? 'text-white/30 border-white/8 bg-white/4'}`}>
                    {inv.status}
                  </span>
                  <span className="text-sm font-bold text-white">${inv.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
