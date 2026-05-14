'use client'

// components/inventory/InventorySettingsClient.tsx
import { useState } from 'react'
import { Settings, Save, CheckCircle } from 'lucide-react'
import type { InventorySettings, BarcodeMode } from '@/lib/inventory/types'

interface Props {
  tenantId:        string
  initialSettings: InventorySettings | null
}

const DEFAULTS: Omit<InventorySettings, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  low_stock_alerts_enabled:  true,
  prediction_alerts_enabled: true,
  default_prediction_days:   14,
  barcode_mode:              'camera',
  auto_create_alerts:        true,
  notify_email:              true,
  notify_dashboard:          true,
  settings:                  {},
}

export function InventorySettingsClient({ tenantId, initialSettings }: Props) {
  const init = initialSettings ?? { ...DEFAULTS, id: '', tenant_id: tenantId, created_at: '', updated_at: '' }

  const [form, setForm]     = useState({
    low_stock_alerts_enabled:  init.low_stock_alerts_enabled,
    prediction_alerts_enabled: init.prediction_alerts_enabled,
    default_prediction_days:   init.default_prediction_days,
    barcode_mode:              init.barcode_mode as BarcodeMode,
    auto_create_alerts:        init.auto_create_alerts,
    notify_email:              init.notify_email,
    notify_dashboard:          init.notify_dashboard,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/inventory/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Save failed')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  function Toggle({ label, desc, field }: { label: string; desc?: string; field: keyof typeof form }) {
    const checked = form[field] as boolean
    return (
      <div className="flex items-center justify-between py-3 border-b border-surface-border/50 last:border-0">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          {desc && <p className="text-xs text-zinc-400">{desc}</p>}
        </div>
        <button
          onClick={() => setForm((f) => ({ ...f, [field]: !checked }))}
          className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-zinc-600'}`}
        >
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-zinc-400" />
            Inventory Settings
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Configure alerts, predictions, and scanning behavior</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {saved && (
        <div className="rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-sm text-green-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Settings saved
        </div>
      )}

      {/* Alerts Section */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Alerts</h2>
        <Toggle
          label="Low Stock Alerts"
          desc="Create alerts when inventory drops below reorder point"
          field="low_stock_alerts_enabled"
        />
        <Toggle
          label="Prediction Alerts"
          desc="Predict and alert before stockouts occur"
          field="prediction_alerts_enabled"
        />
        <Toggle
          label="Auto-Create Alerts"
          desc="Automatically generate alerts after order completion"
          field="auto_create_alerts"
        />
        <div className="pt-3">
          <label className="text-xs text-zinc-400 mb-1 block">Default Prediction Window (days)</label>
          <input
            type="number"
            min={1}
            max={90}
            value={form.default_prediction_days}
            onChange={(e) => setForm((f) => ({ ...f, default_prediction_days: parseInt(e.target.value) || 14 }))}
            className="w-32 rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
          />
          <p className="text-xs text-zinc-500 mt-1">How far ahead to predict stockouts</p>
        </div>
      </div>

      {/* Barcode Section */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Barcode Scanner</h2>
        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Default Scanner Mode</label>
          <div className="flex gap-2 flex-wrap">
            {(['camera', 'manual', 'both'] as BarcodeMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setForm((f) => ({ ...f, barcode_mode: m }))}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors capitalize ${
                  form.barcode_mode === m
                    ? 'border-teal-400/50 bg-teal-400/10 text-teal-400'
                    : 'border-surface-border text-zinc-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Notifications</h2>
        <Toggle
          label="Dashboard Notifications"
          desc="Show alert badges and notifications in the dashboard"
          field="notify_dashboard"
        />
        <Toggle
          label="Email Notifications"
          desc="Send email alerts for critical stock levels"
          field="notify_email"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Settings</>}
      </button>
    </div>
  )
}
