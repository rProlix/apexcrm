'use client'
// components/payments/InvoiceForm.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Receipt, Send } from 'lucide-react'
import { InvoiceItemEditor, type InvoiceItem } from './InvoiceItemEditor'

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
  onCreated: (invoice: Record<string, unknown>) => void
}

export function InvoiceForm({ onClose, customers, currency, onCreated }: Props) {
  const [form, setForm] = useState({
    customer_id: '',
    title:       '',
    description: '',
    due_date:    '',
    currency,
  })
  const [items,   setItems]   = useState<InvoiceItem[]>([{ name: '', quantity: 1, unit_price: 0 }])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [sendLink, setSendLink] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }

    const validItems = items.filter((i) => i.name.trim() && i.unit_price >= 0)
    if (validItems.length === 0) { setError('At least one valid item is required'); return }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/payments/invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: form.customer_id || undefined,
          title:       form.title.trim(),
          description: form.description.trim() || undefined,
          currency:    form.currency,
          due_date:    form.due_date  || undefined,
          items:       validItems.map((i) => ({
            name:       i.name,
            quantity:   i.quantity,
            unit_price: i.unit_price,
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Optionally create a payment link and send it
      if (sendLink && form.customer_id) {
        await fetch(`/api/payments/invoices/${data.invoice.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      }

      onCreated(data.invoice)
      onClose()
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
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{ opacity: 0, scale: 0.96,    y: 8  }}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto premium-panel premium-border rounded-2xl shadow-2xl"
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
                <Receipt className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
              </div>
              <h2 className="text-base font-semibold text-white">New Invoice</h2>
            </div>
            <button
              onClick={onClose}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/6 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>
            )}

            {/* Customer */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Customer (optional)</label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="store-input w-full text-sm"
              >
                <option value="">No customer assigned</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} — {c.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">
                Invoice Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. April Service Invoice"
                className="store-input w-full text-sm"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Additional notes for this invoice…"
                rows={2}
                className="store-input w-full text-sm resize-none"
              />
            </div>

            {/* Due date + currency */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">Due Date (optional)</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="store-input w-full text-sm"
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

            {/* Items */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-3">Line Items</label>
              <InvoiceItemEditor
                items={items}
                onChange={setItems}
                currency={form.currency}
              />
            </div>

            {/* Send link toggle */}
            {form.customer_id && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendLink}
                  onChange={(e) => setSendLink(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-gold-500"
                />
                <span className="text-xs text-white/60">
                  Create and send payment link to customer after saving
                </span>
              </label>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 h-10 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
              >
                {sendLink ? <Send className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                {loading ? 'Creating…' : sendLink ? 'Create & Send' : 'Create Invoice'}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
