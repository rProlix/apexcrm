'use client'
// components/payments/InvoiceList.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Receipt, Send, Search, Filter, ExternalLink, Trash2 } from 'lucide-react'
import { InvoiceForm } from './InvoiceForm'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface InvoiceItem {
  id:          string
  name:        string
  quantity:    number
  unit_price:  number
  total_price: number
}

interface Invoice {
  id:             string
  invoice_number: string
  title:          string
  description:    string | null
  amount:         number
  currency:       string
  status:         string
  due_date:       string | null
  created_at:     string
  customer_id:    string | null
  invoice_items:  InvoiceItem[]
}

interface Customer {
  id:         string
  first_name: string
  last_name:  string
  email:      string
}

interface Props {
  initialInvoices: Invoice[]
  customers:       Customer[]
  tenantId:        string
}

const STATUS_STYLES: Record<string, string> = {
  draft:               'text-white/50      bg-white/4         border-white/8',
  pending:             'text-yellow-400    bg-yellow-400/10   border-yellow-400/20',
  paid:                'text-emerald-400   bg-emerald-400/10  border-emerald-400/20',
  failed:              'text-red-400       bg-red-400/10      border-red-400/20',
  canceled:            'text-white/30      bg-white/4         border-white/8',
  refunded:            'text-orange-400    bg-orange-400/10   border-orange-400/20',
  partially_refunded:  'text-amber-400     bg-amber-400/10    border-amber-400/20',
}

const STATUS_OPTIONS = ['all', 'draft', 'pending', 'paid', 'failed', 'canceled', 'refunded']

export function InvoiceList({ initialInvoices, customers, tenantId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices)
  const [showForm, setShowForm] = useState(false)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')
  const [sending,  setSending]  = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]))

  const filtered = invoices.filter((inv) => {
    const matchStatus = filter === 'all' || inv.status === filter
    const matchSearch = !search.trim() ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (inv.title ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  async function handleSend(invoiceId: string) {
    setSending(invoiceId)
    setError(null)
    try {
      const res = await fetch(`/api/payments/invoices/${invoiceId}/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setInvoices((prev) =>
        prev.map((inv) => inv.id === invoiceId ? { ...inv, status: 'pending' } : inv)
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(null)
    }
  }

  async function handleDelete(invoiceId: string) {
    if (!confirm('Delete this invoice? This action cannot be undone.')) return

    try {
      const res = await fetch(`/api/payments/invoices/${invoiceId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const defaultCurrency = invoices[0]?.currency ?? 'USD'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Invoices</h1>
          <p className="text-sm text-white/40 mt-1">{invoices.length} total</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
          <input
            type="text"
            placeholder="Search invoices…"
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
                  : 'text-white/40 border border-white/8 hover:text-white/70 hover:border-white/16'
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
          <div className="h-14 w-14 rounded-2xl bg-gold-400/8 border border-gold-400/15 flex items-center justify-center mb-4">
            <Receipt className="h-7 w-7 text-gold-400/40" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No invoices found</h3>
          <p className="text-sm text-white/35">
            {search || filter !== 'all' ? 'Try adjusting your filters' : 'Create your first invoice to get started'}
          </p>
        </div>
      ) : (
        <div className="premium-panel premium-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Invoice</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Customer</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-white/30 px-4 py-3">Due</th>
                  <th className="text-right text-xs font-medium text-white/30 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {filtered.map((inv, i) => {
                  const customer = inv.customer_id ? customerMap[inv.customer_id] : null
                  return (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-white/2 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white">{inv.invoice_number}</p>
                        <p className="text-xs text-white/35 mt-0.5 truncate max-w-[180px]">{inv.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        {customer ? (
                          <div>
                            <p className="text-sm text-white">{customer.first_name} {customer.last_name}</p>
                            <p className="text-xs text-white/35">{customer.email}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-white/25">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-gold-400">
                          {formatCurrency(Number(inv.amount), inv.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-white/35">
                          {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {inv.status === 'draft' && inv.customer_id && (
                            <button
                              onClick={() => handleSend(inv.id)}
                              disabled={sending === inv.id}
                              title="Send payment link"
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-gold-400/50 hover:text-gold-400 hover:bg-gold-400/8 transition-colors disabled:opacity-40"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {['draft', 'pending'].includes(inv.status) && (
                            <button
                              onClick={() => handleDelete(inv.id)}
                              title="Delete invoice"
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/8 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <InvoiceForm
          onClose={() => setShowForm(false)}
          customers={customers}
          currency={defaultCurrency}
          onCreated={(invoice) => setInvoices((prev) => [invoice as unknown as Invoice, ...prev])}
        />
      )}
    </div>
  )
}
