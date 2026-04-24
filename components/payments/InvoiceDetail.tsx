'use client'
// components/payments/InvoiceDetail.tsx
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Receipt, CheckCircle2, Clock, XCircle, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface InvoiceItem {
  id:          string
  name:        string
  description?: string
  quantity:    number
  unit_price:  number
  total_price: number
}

interface Invoice {
  id:               string
  invoice_number:   string
  title:            string
  description:      string | null
  amount:           number
  currency:         string
  status:           string
  due_date:         string | null
  created_at:       string
  provider_key:     string | null
  provider_reference: string | null
  invoice_items:    InvoiceItem[]
}

interface Props {
  invoice: Invoice
}

const STATUS_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; border: string }> = {
  draft:    { icon: Clock,        color: 'text-white/50', bg: 'bg-white/4',         border: 'border-white/8' },
  pending:  { icon: Clock,        color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  paid:     { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  failed:   { icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20' },
  refunded: { icon: RotateCcw,    color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  canceled: { icon: XCircle,      color: 'text-white/30',   bg: 'bg-white/4',       border: 'border-white/8' },
}

export function InvoiceDetail({ invoice }: Props) {
  const config   = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft
  const StatusIcon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{invoice.invoice_number}</h1>
            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${config.bg} ${config.border} ${config.color}`}>
              <StatusIcon className="h-3 w-3" strokeWidth={2} />
              {invoice.status}
            </span>
          </div>
          <p className="text-sm text-white/40">{invoice.title}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gold-400">
            {formatCurrency(Number(invoice.amount), invoice.currency)}
          </p>
          {invoice.due_date && (
            <p className="text-xs text-white/35 mt-1">
              Due {new Date(invoice.due_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {invoice.description && (
        <p className="text-sm text-white/50 leading-relaxed">{invoice.description}</p>
      )}

      {/* Line items */}
      <div className="premium-panel premium-border rounded-2xl overflow-hidden">
        <div className="border-b border-white/6 px-5 py-3">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wide">Line Items</p>
        </div>
        <div className="divide-y divide-white/4">
          {invoice.invoice_items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-white/35 mt-0.5">{item.description}</p>
                )}
                <p className="text-xs text-white/30 mt-0.5">
                  {item.quantity} × {formatCurrency(Number(item.unit_price), invoice.currency)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gold-400 flex-shrink-0 ml-4">
                {formatCurrency(Number(item.total_price), invoice.currency)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/8 px-5 py-4 flex items-center justify-between bg-white/2">
          <span className="text-sm font-semibold text-white">Total</span>
          <span className="text-xl font-bold text-gold-400">
            {formatCurrency(Number(invoice.amount), invoice.currency)}
          </span>
        </div>
      </div>

      {/* Provider ref */}
      {invoice.provider_reference && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/8">
          <Receipt className="h-4 w-4 text-white/30 flex-shrink-0" />
          <div>
            <p className="text-xs text-white/40">Provider Reference</p>
            <p className="text-xs text-white/60 font-mono mt-0.5">{invoice.provider_reference}</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
