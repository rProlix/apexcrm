'use client'

import { useState } from 'react'
import { Save, Settings, CreditCard, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface POSSettings {
  default_tax_rate:               number
  tips_enabled:                   boolean
  service_fee_enabled:            boolean
  service_fee_percent:            number
  require_customer_for_order:     boolean
  allow_custom_items:             boolean
  allow_item_notes:               boolean
  allow_kitchen_notes:            boolean
  allow_discounts:                boolean
  manager_approval_for_discounts: boolean
  inventory_deduction_timing:     string
  order_number_prefix:            string
  receipt_branding:               Record<string, unknown>
}

interface Props {
  tenantId:        string
  initialSettings: Record<string, unknown> | null
  paymentProviders: Array<{ provider_key: string; is_enabled: boolean; is_default: boolean }>
}

export function POSSettingsClient({ tenantId, initialSettings, paymentProviders }: Props) {
  const [settings, setSettings] = useState<POSSettings>({
    default_tax_rate:               Number(initialSettings?.default_tax_rate ?? 0),
    tips_enabled:                   Boolean(initialSettings?.tips_enabled ?? true),
    service_fee_enabled:            Boolean(initialSettings?.service_fee_enabled ?? false),
    service_fee_percent:            Number(initialSettings?.service_fee_percent ?? 0),
    require_customer_for_order:     Boolean(initialSettings?.require_customer_for_order ?? false),
    allow_custom_items:             Boolean(initialSettings?.allow_custom_items ?? true),
    allow_item_notes:               Boolean(initialSettings?.allow_item_notes ?? true),
    allow_kitchen_notes:            Boolean(initialSettings?.allow_kitchen_notes ?? true),
    allow_discounts:                Boolean(initialSettings?.allow_discounts ?? true),
    manager_approval_for_discounts: Boolean(initialSettings?.manager_approval_for_discounts ?? false),
    inventory_deduction_timing:     String(initialSettings?.inventory_deduction_timing ?? 'payment_completed'),
    order_number_prefix:            String(initialSettings?.order_number_prefix ?? 'POS'),
    receipt_branding:               (initialSettings?.receipt_branding as Record<string, unknown>) ?? {},
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const set = <K extends keyof POSSettings>(key: K, value: POSSettings[K]) =>
    setSettings((p) => ({ ...p, [key]: value }))

  const save = async () => {
    setSaving(true); setSaved(false); setError(null)
    try {
      const res = await fetch('/api/pos/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save settings'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">POS Settings</h1>
            <p className="text-sm text-zinc-400 mt-1">Configure your Point of Sale</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

        <div className="space-y-5">
          {/* Tax */}
          <Section title="Tax & Fees">
            <Field label="Default Tax Rate (%)" hint="Applied to all taxable items">
              <input type="number" min="0" max="100" step="0.01"
                value={settings.default_tax_rate}
                onChange={(e) => set('default_tax_rate', parseFloat(e.target.value) || 0)}
                className="input-field" />
            </Field>
            <Toggle label="Enable Tips" checked={settings.tips_enabled} onChange={(v) => set('tips_enabled', v)} />
            <Toggle label="Enable Service Fee" checked={settings.service_fee_enabled} onChange={(v) => set('service_fee_enabled', v)} />
            {settings.service_fee_enabled && (
              <Field label="Service Fee (%)" hint="Applied to subtotal">
                <input type="number" min="0" max="100" step="0.01"
                  value={settings.service_fee_percent}
                  onChange={(e) => set('service_fee_percent', parseFloat(e.target.value) || 0)}
                  className="input-field" />
              </Field>
            )}
          </Section>

          {/* Orders */}
          <Section title="Order Settings">
            <Field label="Order Number Prefix" hint="e.g. POS, ORD, TICKET">
              <input type="text" maxLength={10}
                value={settings.order_number_prefix}
                onChange={(e) => set('order_number_prefix', e.target.value.toUpperCase())}
                className="input-field" />
            </Field>
            <Toggle label="Require Customer for Every Order" checked={settings.require_customer_for_order} onChange={(v) => set('require_customer_for_order', v)} />
            <Toggle label="Allow Custom Items" hint="Let staff create ad-hoc items" checked={settings.allow_custom_items} onChange={(v) => set('allow_custom_items', v)} />
            <Toggle label="Allow Item Notes" checked={settings.allow_item_notes} onChange={(v) => set('allow_item_notes', v)} />
            <Toggle label="Allow Kitchen Notes" checked={settings.allow_kitchen_notes} onChange={(v) => set('allow_kitchen_notes', v)} />
          </Section>

          {/* Discounts */}
          <Section title="Discounts">
            <Toggle label="Allow Discounts" checked={settings.allow_discounts} onChange={(v) => set('allow_discounts', v)} />
            {settings.allow_discounts && (
              <Toggle label="Require Manager Approval for Discounts" checked={settings.manager_approval_for_discounts} onChange={(v) => set('manager_approval_for_discounts', v)} />
            )}
          </Section>

          {/* Inventory */}
          <Section title="Inventory Deduction">
            <Field label="Deduct Inventory When" hint="Controls when inventory quantities are reduced">
              <select
                value={settings.inventory_deduction_timing}
                onChange={(e) => set('inventory_deduction_timing', e.target.value)}
                className="input-field"
              >
                <option value="order_created">Order Created</option>
                <option value="sent_to_kitchen">Sent to Kitchen</option>
                <option value="payment_completed">Payment Completed</option>
                <option value="order_completed">Order Completed</option>
              </select>
            </Field>
          </Section>

          {/* Payment Providers */}
          <Section title="Payment Providers">
            {paymentProviders.length > 0 ? (
              <div className="space-y-2">
                {paymentProviders.map((p) => (
                  <div key={p.provider_key} className="flex items-center justify-between px-3 py-2.5 bg-zinc-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-zinc-500" />
                      <span className="text-sm text-zinc-200 capitalize">{p.provider_key}</span>
                      {p.is_default && <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">Default</span>}
                    </div>
                    <span className={`text-xs font-medium ${p.is_enabled ? 'text-green-400' : 'text-zinc-500'}`}>
                      {p.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ))}
                <Link href="/payments/settings" className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors mt-2">
                  <ExternalLink className="w-3 h-3" />
                  Manage payment providers
                </Link>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-500 mb-2">No payment providers configured</p>
                <Link href="/payments/settings" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
                  Set up payment providers →
                </Link>
              </div>
            )}
          </Section>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-zinc-300 block mb-1">{label}</label>
      {hint && <p className="text-xs text-zinc-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-zinc-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

// Tailwind utility referenced in the component
const inputFieldStyle = `
  .input-field {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: rgb(39 39 42);
    border: 1px solid rgb(63 63 70);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: rgb(244 244 245);
    outline: none;
  }
  .input-field:focus { border-color: rgb(124 58 237); }
`
