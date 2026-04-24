'use client'
// components/payments/PaymentLinkList.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Plus, Copy, Check, ExternalLink, XCircle } from 'lucide-react'
import { PaymentLinkForm } from './PaymentLinkForm'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface PaymentLink {
  id:              string
  title:           string | null
  amount:          number
  currency:        string
  provider_key:    string
  url:             string | null
  status:          string
  created_at:      string
}

interface Invoice {
  id:             string
  invoice_number: string
  title:          string
  amount:         number
  currency:       string
  status:         string
}

interface Props {
  initialLinks: PaymentLink[]
  invoices:     Invoice[]
  tenantId:     string
}

const STATUS_STYLES: Record<string, string> = {
  active:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  expired: 'text-white/30 bg-white/4 border-white/8',
  canceled: 'text-red-400 bg-red-400/10 border-red-400/20',
}

const PROVIDER_NAMES: Record<string, string> = { stripe: 'Stripe', square: 'Square' }

export function PaymentLinkList({ initialLinks, invoices, tenantId }: Props) {
  const [links,    setLinks]    = useState<PaymentLink[]>(initialLinks)
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  async function copyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* ignore */ }
  }

  async function cancelLink(id: string) {
    if (!confirm('Cancel this payment link? It will no longer be usable.')) return

    try {
      const res = await fetch(`/api/payments/payment-links/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'canceled' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLinks((prev) => prev.map((l) => l.id === id ? { ...l, status: 'canceled' } : l))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const defaultCurrency = links[0]?.currency ?? 'USD'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payment Links</h1>
          <p className="text-sm text-white/40 mt-1">{links.length} total</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
        >
          <Plus className="h-4 w-4" />
          New Link
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>
      )}

      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gold-400/8 border border-gold-400/15 flex items-center justify-center mb-4">
            <Zap className="h-7 w-7 text-gold-400/40" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No payment links yet</h3>
          <p className="text-sm text-white/35">Create a payment link to share with your customers</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link, i) => (
            <motion.div
              key={link.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="premium-panel premium-border rounded-2xl p-4 hover:border-white/12 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-gold-400/8 border border-gold-400/15 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-gold-400/70" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {link.title ?? 'Payment Link'}
                    </p>
                    <p className="text-xs text-white/35 mt-0.5">
                      {PROVIDER_NAMES[link.provider_key] ?? link.provider_key}
                      {' · '}
                      {new Date(link.created_at).toLocaleDateString()}
                    </p>
                    {link.url && (
                      <p className="text-xs text-white/20 font-mono mt-1 truncate max-w-[240px]">
                        {link.url}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-base font-bold text-gold-400">
                      {formatCurrency(Number(link.amount), link.currency)}
                    </p>
                    <span className={`inline-block text-xs px-2 py-0.5 mt-1 rounded-full border ${STATUS_STYLES[link.status] ?? STATUS_STYLES.expired}`}>
                      {link.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {link.url && link.status === 'active' && (
                      <>
                        <button
                          onClick={() => copyLink(link.id, link.url!)}
                          title="Copy link"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-gold-400 hover:bg-gold-400/8 transition-colors"
                        >
                          {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open link"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-gold-400 hover:bg-gold-400/8 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => cancelLink(link.id)}
                          title="Cancel link"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/8 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showForm && (
        <PaymentLinkForm
          onClose={() => setShowForm(false)}
          invoices={invoices}
          currency={defaultCurrency}
          onCreated={(link) => setLinks((prev) => [link as unknown as PaymentLink, ...prev])}
        />
      )}
    </div>
  )
}
