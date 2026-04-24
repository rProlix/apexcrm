'use client'
// components/customers/CustomerPaymentsList.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, FileText } from 'lucide-react'
import type { CustomerTransaction, CustomerInvoice } from '@/lib/customers/getCustomerPayments'

interface Props {
  transactions: CustomerTransaction[]
  invoices:     CustomerInvoice[]
  tenantId:     string
}

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
  void:    'text-white/20 bg-white/4 border-white/8',
}

const PROVIDER_NAMES: Record<string, string> = {
  stripe: 'Stripe',
  square: 'Square',
  manual: 'Manual',
}

export function CustomerPaymentsList({ transactions, invoices, tenantId }: Props) {
  const [tab, setTab] = useState<'transactions' | 'invoices'>('transactions')

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-2 p-1 bg-graphite-900 rounded-xl w-fit">
        {(['transactions', 'invoices'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 capitalize ${
              tab === t
                ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t} ({t === 'transactions' ? transactions.length : invoices.length})
          </button>
        ))}
      </div>

      {/* Transactions */}
      {tab === 'transactions' && (
        <>
          {transactions.length === 0 ? (
            <div className="premium-panel premium-border rounded-2xl py-12 flex flex-col items-center gap-3">
              <CreditCard className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/40">No transactions found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="premium-panel premium-border rounded-xl flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-cyan-400/10 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80 capitalize">
                        {tx.transaction_type} · {PROVIDER_NAMES[tx.provider_key] ?? tx.provider_key}
                      </p>
                      <p className="text-xs text-white/30">{new Date(tx.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TX_STATUS[tx.status] ?? 'text-white/30 bg-white/4 border-white/8'}`}>
                      {tx.status}
                    </span>
                    <span className="text-sm font-bold text-white">
                      ${tx.amount.toFixed(2)} <span className="text-xs font-normal text-white/30">{tx.currency.toUpperCase()}</span>
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Invoices */}
      {tab === 'invoices' && (
        <>
          {invoices.length === 0 ? (
            <div className="premium-panel premium-border rounded-2xl py-12 flex flex-col items-center gap-3">
              <FileText className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/40">No invoices found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv, i) => (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="premium-panel premium-border rounded-xl flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gold-400/10 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-gold-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80">{inv.title}</p>
                      <p className="text-xs text-white/30">
                        #{inv.invoice_number} · {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${INV_STATUS[inv.status] ?? 'text-white/30 bg-white/4 border-white/8'}`}>
                      {inv.status}
                    </span>
                    <span className="text-sm font-bold text-white">${inv.amount.toFixed(2)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
