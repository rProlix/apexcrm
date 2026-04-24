'use client'
// components/payments/CustomerPaymentHistory.tsx
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { CreditCard, CheckCircle2, Clock, XCircle, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface Transaction {
  id:                      string
  invoice_id:              string | null
  provider_key:            string
  provider_transaction_id: string | null
  amount:                  number
  currency:                string
  status:                  string
  transaction_type:        string
  created_at:              string
}

interface Props {
  transactions: Transaction[]
  currency?:    string
}

const STATUS_ICON: Record<string, LucideIcon> = {
  succeeded: CheckCircle2,
  pending:   Clock,
  failed:    XCircle,
  refunded:  RotateCcw,
  canceled:  XCircle,
}

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'text-emerald-400',
  pending:   'text-yellow-400',
  failed:    'text-red-400',
  refunded:  'text-orange-400',
  canceled:  'text-white/30',
}

const PROVIDER_LABELS: Record<string, string> = { stripe: 'Stripe', square: 'Square' }

export function CustomerPaymentHistory({ transactions, currency = 'USD' }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mb-4">
          <CreditCard className="h-7 w-7 text-white/15" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-semibold text-white/60 mb-1">No transactions yet</h3>
        <p className="text-xs text-white/30">Your payment history will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx, i) => {
        const StatusIcon  = STATUS_ICON[tx.status] ?? CreditCard
        const statusColor = STATUS_COLOR[tx.status] ?? 'text-white/30'

        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-8 w-8 rounded-lg bg-white/4 border border-white/8 flex items-center justify-center flex-shrink-0`}>
                <StatusIcon className={`h-4 w-4 ${statusColor}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {PROVIDER_LABELS[tx.provider_key] ?? tx.provider_key}
                  {' · '}
                  <span className="capitalize">{tx.transaction_type}</span>
                </p>
                <p className="text-xs text-white/35 mt-0.5">
                  {new Date(tx.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-xs capitalize ${statusColor}`}>{tx.status}</span>
              <span className="text-sm font-bold text-white">
                {formatCurrency(Number(tx.amount), tx.currency)}
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
