// app/(customer)/portal/payments/page.tsx
import { headers } from 'next/headers'
import Link from 'next/link'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerInvoices } from '@/lib/payments/getCustomerTransactions'
import { formatCurrency } from '@/lib/payments/formatCurrency'
import { CreditCard, Receipt, Clock, ArrowRight } from 'lucide-react'

export const metadata = { title: 'Payments — Customer Portal' }

const STATUS_STYLES: Record<string, string> = {
  draft:    'text-white/40   bg-white/4          border-white/8',
  pending:  'text-yellow-400 bg-yellow-400/10    border-yellow-400/20',
  paid:     'text-emerald-400 bg-emerald-400/10  border-emerald-400/20',
  failed:   'text-red-400    bg-red-400/10       border-red-400/20',
  canceled: 'text-white/25   bg-white/4          border-white/8',
  refunded: 'text-orange-400 bg-orange-400/10    border-orange-400/20',
}

export default async function CustomerPaymentsPage() {
  const host = headers().get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const invoices = await getCustomerInvoices(ctx.tenant_id, ctx.customer_id)

  const pending = invoices.filter((i) => i.status === 'pending')
  const paid    = invoices.filter((i) => i.status === 'paid')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payments</h1>
          <p className="text-sm text-white/40">Your invoices and payment history</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending', value: pending.length, color: 'text-yellow-400',  bg: 'bg-yellow-400/8'  },
          { label: 'Paid',    value: paid.length,    color: 'text-emerald-400', bg: 'bg-emerald-400/8' },
          { label: 'Total',   value: invoices.length, color: 'text-gold-400',   bg: 'bg-gold-400/8'    },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} border border-white/6 rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Pending invoices — pay CTA */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-400" />
            Pending Payment
          </h2>
          <div className="space-y-3">
            {pending.map((inv) => (
              <Link
                key={inv.id}
                href={`/portal/payments/${inv.id}`}
                className="block group focus:outline-none"
              >
                <div className="premium-panel premium-border rounded-2xl p-4 hover:border-gold-500/30 hover:shadow-glow-gold/10 transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{inv.invoice_number}</p>
                      <p className="text-xs text-white/40 mt-0.5 truncate">{inv.title}</p>
                      {inv.due_date && (
                        <p className="text-xs text-yellow-400/70 mt-1">
                          Due {new Date(inv.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-lg font-bold text-gold-400">
                        {formatCurrency(Number(inv.amount), inv.currency)}
                      </span>
                      <div className="h-8 px-3 rounded-xl bg-gold-gradient text-graphite-900 text-xs font-semibold flex items-center gap-1 group-hover:shadow-glow-gold transition-shadow">
                        Pay <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* All invoices */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Receipt className="h-4 w-4 text-white/40" />
            All Invoices
          </h2>
          <Link
            href="/portal/payments/history"
            className="text-xs text-gold-400 hover:underline flex items-center gap-1"
          >
            Transaction history <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mb-3">
              <Receipt className="h-6 w-6 text-white/15" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-white/30">No invoices yet</p>
          </div>
        ) : (
          <div className="premium-panel premium-border rounded-2xl divide-y divide-white/5">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/portal/payments/${inv.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{inv.invoice_number}</p>
                  <p className="text-xs text-white/35 mt-0.5 truncate max-w-[200px]">{inv.title}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft}`}>
                    {inv.status}
                  </span>
                  <span className="text-sm font-semibold text-gold-400">
                    {formatCurrency(Number(inv.amount), inv.currency)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-white/20" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
