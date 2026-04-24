'use client'
// components/payments/ProviderSettingsForm.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, Save, Info } from 'lucide-react'

interface PaymentSettings {
  id:                          string
  tenant_id:                   string
  default_provider:            string
  currency:                    string
  tax_rate:                    number
  allow_manual_invoices:       boolean
  allow_saved_payment_methods: boolean
  allow_partial_payments:      boolean
  receipt_email_enabled:       boolean
  created_at:                  string
  updated_at:                  string
}

interface Props {
  settings: PaymentSettings
  tenantId: string
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'BRL']
const PROVIDERS  = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'square', label: 'Square' },
]

export function ProviderSettingsForm({ settings, tenantId }: Props) {
  const [form, setForm]       = useState({ ...settings })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/payments/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_provider:            form.default_provider,
          currency:                    form.currency,
          tax_rate:                    Number(form.tax_rate),
          allow_manual_invoices:       form.allow_manual_invoices,
          allow_saved_payment_methods: form.allow_saved_payment_methods,
          allow_partial_payments:      form.allow_partial_payments,
          receipt_email_enabled:       form.receipt_email_enabled,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setForm({ ...form, ...data.settings })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key: 'allow_manual_invoices' | 'allow_saved_payment_methods' | 'allow_partial_payments' | 'receipt_email_enabled') => {
    setForm({ ...form, [key]: !form[key] })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
          <Settings className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payment Settings</h1>
          <p className="text-sm text-white/40">Configure billing preferences for your workspace</p>
        </div>
      </div>

      {error   && <div className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">{error}</div>}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-emerald-400/8 border border-emerald-400/20 text-sm text-emerald-400"
        >
          Settings saved successfully
        </motion.div>
      )}

      {/* Provider & Currency */}
      <div className="premium-panel premium-border rounded-2xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-white/80">Provider & Currency</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2">Default Provider</label>
            <select
              value={form.default_provider}
              onChange={(e) => setForm({ ...form, default_provider: e.target.value })}
              className="store-input w-full text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2">Currency</label>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="store-input w-full text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/50 mb-2">Tax Rate (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.tax_rate}
            onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })}
            className="store-input w-32 text-sm"
          />
          <p className="text-xs text-white/30 mt-1.5">Applied automatically to all new invoices</p>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="premium-panel premium-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white/80">Features</h2>

        {[
          {
            key:   'allow_manual_invoices' as const,
            label: 'Manual Invoices',
            desc:  'Allow admins to create invoices for any amount',
          },
          {
            key:   'allow_saved_payment_methods' as const,
            label: 'Saved Payment Methods',
            desc:  'Allow customers to save cards for future payments',
          },
          {
            key:   'allow_partial_payments' as const,
            label: 'Partial Payments & Refunds',
            desc:  'Allow payments and refunds less than the full invoice amount',
          },
          {
            key:   'receipt_email_enabled' as const,
            label: 'Receipt Emails',
            desc:  'Send automated receipt emails after successful payments',
          },
        ].map((feature) => (
          <label key={feature.key} className="flex items-start justify-between gap-4 cursor-pointer group">
            <div>
              <p className="text-sm font-medium text-white group-hover:text-gold-400 transition-colors">
                {feature.label}
              </p>
              <p className="text-xs text-white/35 mt-0.5">{feature.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form[feature.key]}
              onClick={() => toggle(feature.key)}
              className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ${
                form[feature.key] ? 'bg-gold-500' : 'bg-white/10'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                  form[feature.key] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        ))}
      </div>

      {/* Webhook info */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-white/3 border border-white/8">
        <Info className="h-4 w-4 text-white/30 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-white/40 space-y-1">
          <p>Configure your payment provider webhooks to point to:</p>
          <p className="font-mono text-white/60 text-xs">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/payments/webhooks/stripe
          </p>
          <p className="font-mono text-white/60 text-xs">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/payments/webhooks/square
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 h-10 px-6 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {loading ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
