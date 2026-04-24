'use client'
// components/payments/TransactionList.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Search, Filter, RotateCcw, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface Transaction {
  id:                      string
  invoice_id:              string | null
  customer_id:             string | null
  provider_key:            string
  provider_transaction_id: string | null
  amount:                  number
  currency:                string
  status:                  string
  transaction_type:        string
  created_at:              string
}

interface Props {
  initialTransactions: Transaction[]
  tenantId:            string
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  succeeded: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed:   'text-red-400 bg-red-400/10 border-red-400/20',
  refunded: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  canceled: 'text-white/30 bg-white/4 border-white/8',
}

const PROVIDER_NAMES: Record<string, string> = { stripe: 'Stripe', square: 'Square' }
const STATUS_OPTIONS = ['all', 'pending', 'succeeded', 'failed', 'refunded', 'canceled']

export function TransactionList({ initialTransactions, tenantId }: Props) {
  const [transactions] = useState<Transaction[]>(initialTransactions)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  const filtered = transactions.filter((tx) => {
    const matchStatus = filter === 'all' || tx.status === filter
    const matchSearch = !search.trim() ||
      (tx.provider_transaction_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      tx.provider_key.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Transactions</h1>
          <p className="text-sm text-white/40 mt-1">{transactions.length} total</p>
        </div>
        <Link
          href="/payments/refunds"
          className="flex items-center gap-2 h-9 px-4 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Issue Refund
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
          <input
            type="text"
            placeholder="Search by provider or transaction ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="store-input w-full text-sm pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-white/30 mr-1" />
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-lg capitalize transition-colors ${
                filter === s
                  ? 'bg-gold-400/15 text-gold-400 border border-gold-400/30'
                  : 'text-white/40 border border-white/8 hover:text-white/70'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mb-4">
            <CreditCard className="h-7 w-7 text-white/20" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No transactions found</h3>
          <p className="text-sm text-white/35">
            {search || filter !== 'all' ? 'Try adjusting your filters' : 'Transactions will appear here after payments are processed'}
          </p>
        </div>
      ) : (
        <div className="premium-panel premium-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Provider</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Ref</th>
                  <th className="text-right text-xs font-medium text-white/30 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {filtered.map((tx, i) => (
                  <motion.tr
                    key={tx.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-white/2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-white/4 border border-white/8 flex items-center justify-center">
                          <CreditCard className="h-3 w-3 text-white/30" strokeWidth={1.75} />
                        </div>
                        <span className="text-sm text-white">
                          {PROVIDER_NAMES[tx.provider_key] ?? tx.provider_key}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-white/50 capitalize">{tx.transaction_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gold-400">
                        {formatCurrency(Number(tx.amount), tx.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[tx.status] ?? STATUS_STYLES.canceled}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-white/35">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-white/25 font-mono truncate max-w-[100px] block">
                        {tx.provider_transaction_id?.slice(0, 16) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tx.status === 'succeeded' && (
                        <Link
                          href={`/payments/refunds?tx=${tx.id}`}
                          className="inline-flex items-center gap-1 text-xs text-white/30 hover:text-orange-400 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Refund
                        </Link>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
