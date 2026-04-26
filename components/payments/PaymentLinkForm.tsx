'use client'
// components/payments/PaymentLinkForm.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Copy, Check } from 'lucide-react'

interface Invoice {
  id:             string
  invoice_number: string
  title:          string
  amount:         number
  currency:       string
}

interface Props {
  onClose:  () => void
  invoices: Invoice[]
  currency: string
  onCreated: (link: Record<string, unknown>) => void
}

export function PaymentLinkForm({ onClose, invoices, currency, onCreated }: Props) {
  const [form, setForm] = useState({
    title:       '',
    amount:      '',
    currency,
    invoice_id:  '',
    provider_key: '',
  })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [created,  setCreated]  = useState<{ url: string; id: string } | null>(null)
  const [copied,   setCopied]   = useState(false)

  const _selectedInvoice = invoices.find((i) => i.id === form.invoice_id)

  function handleInvoiceChange(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId)
    setForm({
      ...form,
      invoice_id: invoiceId,
      title:      inv ? (inv.title ?? `Invoice ${inv.invoice_number}`) : form.title,
      amount:     inv ? String(Number(inv.amount).toFixed(2)) : form.amount,
      currency:   inv ? inv.currency : form.currency,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }

    const parsedAmount = Number(form.amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Amount must be a positive number'); return }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/payments/payment-links', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        form.title.trim(),
          amount:       parsedAmount,
          currency:     form.currency,
          invoice_id:   form.invoice_id || undefined,
          provider_key: form.provider_key || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCreated({ url: data.link.url, id: data.link.id })
      onCreated(data.link)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!created?.url) return
    await navigator.clipboard.writeText(created.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="w-full max-w-md premium-panel premium-border rounded-2xl shadow-2xl"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
                <Zap className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
              </div>
              <h2 className="text-base font-semibold text-white">New Payment Link</h2>
            </div>
            <button
              onClick={onClose}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/6 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {created ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-400/8 border border-emerald-400/20">
                <Check className="h-4 w-4 text-emerald-400" />
                <p className="text-sm text-emerald-400 font-medium">Payment link created!</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-2">Share this link with your customer:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={created.url}
                    className="store-input w-full text-xs font-mono text-white/60"
                  />
                  <button
                    onClick={copy}
                    className="flex-shrink-0 h-9 px-3 rounded-xl border border-white/10 hover:border-gold-400/30 text-white/40 hover:text-gold-400 transition-colors"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
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
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>
              )}

              {/* Link to invoice */}
              {invoices.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Link to Invoice (optional)</label>
                  <select
                    value={form.invoice_id}
                    onChange={(e) => handleInvoiceChange(e.target.value)}
                    className="store-input w-full text-sm"
                  >
                    <option value="">Standalone payment link</option>
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {inv.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Consultation Fee"
                  className="store-input w-full text-sm"
                  required
                />
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

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" />
                  {loading ? 'Creating…' : 'Create Link'}
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
