'use client'
// components/payments/RefundForm.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface Transaction {
  id:                      string
  provider_transaction_id: string | null
  amount:                  number
  currency:                string
  status:                  string
  created_at:              string
}

interface Refund {
  id:                     string
  payment_transaction_id: string
  provider_refund_id:     string | null
  amount:                 number
  status:                 string
  created_at:             string
  payment_transactions?: {
    provider_transaction_id: string | null
    amount:                  number
    currency:                string
    status:                  string
  }
}

interface Props {
  initialRefunds:        Refund[]
  availableTransactions: Transaction[]
  tenantId:              string
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  succeeded: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed:   'text-red-400 bg-red-400/10 border-red-400/20',
}

export function RefundForm({ initialRefunds, availableTransactions, tenantId }: Props) {
  const [refunds, setRefunds] = useState<Refund[]>(initialRefunds)
  const [search,  setSearch]  = useState('')

  const [form, setForm] = useState({
    transaction_id: '',
    amount:         '',
    reason:         '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedTx = availableTransactions.find((tx) => tx.id === form.transaction_id)

  async function handleRefund(e: React.FormEvent) {
    e.preventDefault()
    if (!form.transaction_id) { setError('Select a transaction to refund'); return }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const body: Record<string, unknown> = { transaction_id: form.transaction_id }
      if (form.amount.trim()) body.amount = Number(form.amount)
      if (form.reason.trim()) body.reason = form.reason.trim()

      const res = await fetch('/api/payments/refunds', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess(`Refund of ${formatCurrency(Number(data.refund.amount), selectedTx?.currency ?? 'USD')} issued successfully`)
      setForm({ transaction_id: '', amount: '', reason: '' })

      // Reload refunds
      const refundsRes = await fetch('/api/payments/refunds')
      if (refundsRes.ok) {
        const refundsData = await refundsRes.json()
        setRefunds(refundsData.refunds ?? [])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const filteredRefunds = refunds.filter((r) => {
    if (!search.trim()) return true
    const ref = r.provider_refund_id ?? ''
    return ref.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Refunds</h1>
        <p className="text-sm text-white/40 mt-1">Issue refunds for completed transactions</p>
      </div>

      {/* Refund form */}
      <div className="premium-panel premium-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-orange-400" strokeWidth={1.75} />
          Issue New Refund
        </h2>

        {error   && <div className="mb-4 p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>}
        {success && <div className="mb-4 p-3 rounded-xl bg-emerald-400/8 border border-emerald-400/20 text-sm text-emerald-400">{success}</div>}

        <form onSubmit={handleRefund} className="space-y-4">
          {/* Transaction select */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2">
              Transaction <span className="text-red-400">*</span>
            </label>
            {availableTransactions.length === 0 ? (
              <p className="text-sm text-white/30 italic">No succeeded transactions available for refund</p>
            ) : (
              <select
                value={form.transaction_id}
                onChange={(e) => setForm({ ...form, transaction_id: e.target.value, amount: '' })}
                className="store-input w-full text-sm"
              >
                <option value="">Select a transaction…</option>
                {availableTransactions.map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {tx.provider_transaction_id?.slice(0, 20) ?? tx.id.slice(0, 8)} —{' '}
                    {formatCurrency(Number(tx.amount), tx.currency)} —{' '}
                    {new Date(tx.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedTx && (
            <div className="p-3 rounded-xl bg-white/3 border border-white/8 text-xs text-white/50">
              Original charge:{' '}
              <span className="text-white font-semibold">
                {formatCurrency(Number(selectedTx.amount), selectedTx.currency)}
              </span>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2">
              Refund Amount (leave blank for full refund)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
                {selectedTx?.currency ?? 'USD'}
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={selectedTx ? Number(selectedTx.amount) : undefined}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={selectedTx ? String(Number(selectedTx.amount).toFixed(2)) : '0.00'}
                className="store-input w-full text-sm pl-12"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2">Reason (optional)</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Customer requested cancellation"
              className="store-input w-full text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !form.transaction_id || availableTransactions.length === 0}
            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-orange-400/15 border border-orange-400/30 text-orange-400 text-sm font-semibold hover:bg-orange-400/25 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {loading ? 'Processing…' : 'Issue Refund'}
          </button>
        </form>
      </div>

      {/* Refund history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Refund History</h2>
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Search refunds…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="store-input w-full text-sm pl-9"
            />
          </div>
        </div>

        {filteredRefunds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <RotateCcw className="h-8 w-8 text-white/15 mb-3" strokeWidth={1.5} />
            <p className="text-sm text-white/30">No refunds yet</p>
          </div>
        ) : (
          <div className="premium-panel premium-border rounded-2xl divide-y divide-white/4">
            {filteredRefunds.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono text-white/50 truncate">
                    {r.provider_refund_id?.slice(0, 24) ?? r.id.slice(0, 12)}
                  </p>
                  <p className="text-xs text-white/25 mt-0.5">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}>
                    {r.status}
                  </span>
                  <span className="text-sm font-semibold text-orange-400">
                    {formatCurrency(
                      Number(r.amount),
                      r.payment_transactions?.currency ?? 'USD'
                    )}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
