'use client'
// components/payments/ChargeCustomerModal.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CreditCard, Check } from 'lucide-react'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface Customer {
  id:         string
  first_name: string
  last_name:  string
  email:      string
}

interface Props {
  onClose:   () => void
  customers: Customer[]
  currency:  string
  onCharged?: (result: Record<string, unknown>) => void
}

export function ChargeCustomerModal({ onClose, customers, currency, onCharged }: Props) {
  const [form, setForm] = useState({
    customer_id:  '',
    amount:       '',
    description:  '',
    currency,
    provider_key: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<{ status: string; amount: number } | null>(null)

  async function handleCharge(e: React.FormEvent) {
    e.preventDefault()

    const parsedAmount = Number(form.amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/payments/charge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:  form.customer_id  || undefined,
          amount:       parsedAmount,
          currency:     form.currency,
          description:  form.description  || undefined,
          provider_key: form.provider_key || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setResult({ status: data.charge.status, amount: data.charge.amount })
      if (onCharged) onCharged(data.charge)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="w-full max-w-md premium-panel premium-border rounded-2xl shadow-2xl"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
              </div>
              <h2 className="text-base font-semibold text-white">Charge Customer</h2>
            </div>
            <button
              onClick={onClose}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/6 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {result ? (
            <div className="p-6 space-y-4">
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                result.status === 'succeeded'
                  ? 'bg-emerald-400/8 border-emerald-400/20 text-emerald-400'
                  : 'bg-yellow-400/8 border-yellow-400/20 text-yellow-400'
              }`}>
                <Check className="h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">
                    {result.status === 'succeeded' ? 'Payment successful' : `Payment ${result.status}`}
                  </p>
                  <p className="text-xs opacity-70 mt-0.5">
                    {formatCurrency(result.amount, form.currency)} — {result.status}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full h-10 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleCharge} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">Customer (optional)</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="store-input w-full text-sm"
                >
                  <option value="">No specific customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name} — {c.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">
                    Amount <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="store-input w-full text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="store-input w-full text-sm"
                  >
                    {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Reason for charge"
                  className="store-input w-full text-sm"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  {loading ? 'Processing…' : 'Charge'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 rounded-xl text-sm text-white/40 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
