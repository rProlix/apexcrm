'use client'

// components/inventory/InventoryAlertsClient.tsx
import { useState, useMemo } from 'react'
import { ShieldAlert, CheckCircle, Clock, X, RefreshCw, Filter } from 'lucide-react'
import type { InventoryAlert, AlertStatus, AlertSeverity } from '@/lib/inventory/types'
import { ALERT_SEVERITY_COLORS, ALERT_STATUS_COLORS } from '@/lib/inventory/types'

interface Props {
  initialAlerts: InventoryAlert[]
  tenantId:      string
  canEdit:       boolean
}

const STATUS_OPTIONS: AlertStatus[]   = ['open', 'acknowledged', 'resolved', 'dismissed']
const SEVERITY_OPTIONS: AlertSeverity[] = ['critical', 'high', 'medium', 'low']

export function InventoryAlertsClient({ initialAlerts, tenantId, canEdit }: Props) {
  const [alerts, setAlerts]           = useState<InventoryAlert[]>(initialAlerts)
  const [filterStatus, setFilterStatus]     = useState<string>('open')
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [recalculating, setRecalculating]   = useState(false)
  const [recalcMsg, setRecalcMsg]           = useState<string | null>(null)

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filterStatus && a.status !== filterStatus) return false
      if (filterSeverity && a.severity !== filterSeverity) return false
      return true
    })
  }, [alerts, filterStatus, filterSeverity])

  async function updateStatus(alertId: string, status: AlertStatus) {
    const res = await fetch(`/api/inventory/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const data = await res.json()
      setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, ...data.alert } : a))
    }
  }

  async function handleRecalculate() {
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const res = await fetch('/api/inventory/alerts/recalculate', { method: 'POST' })
      const data = await res.json()
      setRecalcMsg(`Created ${data.created ?? 0} alerts, resolved ${data.resolved ?? 0}`)
      // Reload alerts
      const res2 = await fetch(`/api/inventory/alerts?status=${filterStatus || ''}`)
      if (res2.ok) {
        const d2 = await res2.json()
        setAlerts(d2.alerts ?? [])
      }
    } finally {
      setRecalculating(false)
    }
  }

  const openCount    = alerts.filter((a) => a.status === 'open').length
  const ackCount     = alerts.filter((a) => a.status === 'acknowledged').length
  const critCount    = alerts.filter((a) => a.severity === 'critical' && a.status !== 'resolved' && a.status !== 'dismissed').length

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-yellow-400" />
            Inventory Alerts
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {openCount} open · {ackCount} acknowledged
            {critCount > 0 && <span className="text-red-400 ml-2">· {critCount} critical</span>}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-border bg-graphite-800/50 hover:bg-graphite-700/50 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        )}
      </div>

      {recalcMsg && (
        <div className="rounded-xl border border-teal-400/30 bg-teal-400/10 px-4 py-3 text-sm text-teal-300">{recalcMsg}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-400">Status:</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {['', ...STATUS_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-teal-500 text-white'
                  : 'border border-surface-border text-zinc-400 hover:text-white'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {['', ...SEVERITY_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterSeverity === s
                  ? 'bg-teal-500 text-white'
                  : 'border border-surface-border text-zinc-400 hover:text-white'
              }`}
            >
              {s || 'All Severity'}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-10 text-center">
          <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
          <p className="text-white font-medium">No alerts</p>
          <p className="text-sm text-zinc-400 mt-1">All inventory levels are healthy</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-2xl border p-4 ${
                alert.severity === 'critical' ? 'border-red-400/40 bg-red-400/5'
                : alert.severity === 'high'   ? 'border-orange-400/30 bg-orange-400/5'
                : 'border-surface-border bg-graphite-800/50'
              }`}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ALERT_SEVERITY_COLORS[alert.severity]}`}>
                      {alert.severity}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ALERT_STATUS_COLORS[alert.status]}`}>
                      {alert.status}
                    </span>
                    <span className="text-xs text-zinc-500 capitalize">{alert.alert_type.replace('_', ' ')}</span>
                  </div>
                  <p className="font-semibold text-white text-sm">{alert.title}</p>
                  {alert.message && <p className="text-xs text-zinc-400 mt-0.5">{alert.message}</p>}
                  {alert.item_name && (
                    <p className="text-xs text-teal-400 mt-1">Item: {alert.item_name}</p>
                  )}
                  {alert.current_quantity !== undefined && (
                    <p className="text-xs text-zinc-400">
                      Current stock: {alert.current_quantity} {alert.item_unit ?? ''}
                    </p>
                  )}
                  {alert.recommended_order_quantity && (
                    <p className="text-xs text-emerald-400 mt-1">
                      Suggested order: {alert.recommended_order_quantity} {alert.item_unit ?? 'units'}
                    </p>
                  )}
                  {alert.predicted_stockout_at && (
                    <p className="text-xs text-orange-400 mt-1">
                      Predicted stockout: {new Date(alert.predicted_stockout_at).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>

                {canEdit && alert.status !== 'resolved' && alert.status !== 'dismissed' && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {alert.status === 'open' && (
                      <button
                        onClick={() => updateStatus(alert.id, 'acknowledged')}
                        className="px-3 py-1.5 rounded-lg bg-yellow-400/10 text-yellow-400 text-xs font-medium hover:bg-yellow-400/20 transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(alert.id, 'resolved')}
                      className="px-3 py-1.5 rounded-lg bg-green-400/10 text-green-400 text-xs font-medium hover:bg-green-400/20 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" /> Resolve
                    </button>
                    <button
                      onClick={() => updateStatus(alert.id, 'dismissed')}
                      className="px-3 py-1.5 rounded-lg bg-zinc-700/50 text-zinc-400 text-xs font-medium hover:bg-zinc-600/50 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
