'use client'

// components/inventory/InventoryDashboard.tsx
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Package, AlertTriangle, TrendingDown, ShieldAlert,
  DollarSign, Plus, Scan, RefreshCw, BarChart2, ArrowRight,
  CheckCircle, Clock,
} from 'lucide-react'
import type { InventoryDashboardStats } from '@/lib/inventory/types'
import { ALERT_SEVERITY_COLORS } from '@/lib/inventory/types'

interface Props {
  tenantId:     string
  stats:        Record<string, unknown> | null
  recentAlerts: Array<{
    id: string
    alert_type: string
    severity: string
    title: string
    status: string
    created_at: string
  }>
}

function StatCard({
  label, value, icon: Icon, color, href,
}: {
  label: string; value: number | string; icon: React.ElementType; color: string; href?: string
}) {
  const inner = (
    <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5 flex items-center gap-4 hover:bg-graphite-700/50 transition-colors">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
      {href && <ArrowRight className="w-4 h-4 text-zinc-500 ml-auto" />}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export function InventoryDashboard({ tenantId, stats, recentAlerts }: Props) {
  const router   = useRouter()
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg]         = useState<string | null>(null)

  const s = stats as InventoryDashboardStats | null

  const totalItems    = s?.total_items ?? 0
  const lowStock      = s?.low_stock_count ?? 0
  const outOfStock    = s?.out_of_stock_count ?? 0
  const openAlerts    = s?.open_alerts_count ?? 0
  const estValue      = s?.estimated_inventory_value ?? 0
  const topConsumed   = s?.top_consumed_items ?? []
  const recentMoves   = s?.recent_movements ?? []

  async function handleRecalculate() {
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const res = await fetch('/api/inventory/alerts/recalculate', { method: 'POST' })
      const data = await res.json()
      setRecalcMsg(`Created ${data.created ?? 0} alerts, resolved ${data.resolved ?? 0}`)
      router.refresh()
    } catch {
      setRecalcMsg('Failed to recalculate')
    } finally {
      setRecalculating(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-teal-400" />
            Inventory
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Track stock levels, movements, and predictive restocking</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventory/items?action=new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Item
          </Link>
          <Link
            href="/inventory/scanner"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-border bg-graphite-800/50 hover:bg-graphite-700/50 text-white text-sm font-medium transition-colors"
          >
            <Scan className="w-4 h-4" /> Scan Barcode
          </Link>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-border bg-graphite-800/50 hover:bg-graphite-700/50 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
            Recalculate Alerts
          </button>
        </div>
      </div>

      {recalcMsg && (
        <div className="rounded-xl border border-teal-400/30 bg-teal-400/10 px-4 py-3 text-sm text-teal-300">
          {recalcMsg}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Items"
          value={totalItems}
          icon={Package}
          color="bg-teal-400/10 text-teal-400"
          href="/inventory/items"
        />
        <StatCard
          label="Low Stock"
          value={lowStock}
          icon={TrendingDown}
          color={lowStock > 0 ? 'bg-orange-400/10 text-orange-400' : 'bg-zinc-400/10 text-zinc-400'}
          href="/inventory/items?low_stock=true"
        />
        <StatCard
          label="Out of Stock"
          value={outOfStock}
          icon={AlertTriangle}
          color={outOfStock > 0 ? 'bg-red-400/10 text-red-400' : 'bg-zinc-400/10 text-zinc-400'}
          href="/inventory/items"
        />
        <StatCard
          label="Open Alerts"
          value={openAlerts}
          icon={ShieldAlert}
          color={openAlerts > 0 ? 'bg-yellow-400/10 text-yellow-400' : 'bg-zinc-400/10 text-zinc-400'}
          href="/inventory/alerts"
        />
        <StatCard
          label="Est. Value"
          value={`$${Number(estValue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          color="bg-emerald-400/10 text-emerald-400"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'View Alerts', href: '/inventory/alerts', icon: ShieldAlert, color: 'text-yellow-400' },
          { label: 'Scan Barcode', href: '/inventory/scanner', icon: Scan, color: 'text-teal-400' },
          { label: 'Trends & Predictions', href: '/inventory/trends', icon: BarChart2, color: 'text-purple-400' },
          { label: 'Settings', href: '/inventory/settings', icon: Package, color: 'text-zinc-400' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 p-4 rounded-xl border border-surface-border bg-graphite-800/50 hover:bg-graphite-700/50 transition-colors"
          >
            <item.icon className={`w-5 h-5 ${item.color}`} />
            <span className="text-sm font-medium text-white">{item.label}</span>
            <ArrowRight className="w-3 h-3 text-zinc-500 ml-auto" />
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Alerts */}
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-yellow-400" />
              Recent Alerts
            </h2>
            <Link href="/inventory/alerts" className="text-xs text-teal-400 hover:text-teal-300">
              View all
            </Link>
          </div>
          {recentAlerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
              <CheckCircle className="w-4 h-4 text-green-400" />
              All stock levels are healthy
            </div>
          ) : (
            <div className="space-y-2">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-3 py-2 border-b border-surface-border/50 last:border-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ALERT_SEVERITY_COLORS[alert.severity as keyof typeof ALERT_SEVERITY_COLORS] ?? 'text-zinc-400 bg-zinc-400/10'}`}>
                    {alert.severity}
                  </span>
                  <span className="text-sm text-zinc-200 flex-1 truncate">{alert.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Consumed */}
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-orange-400" />
              Top Consumed (30 days)
            </h2>
            <Link href="/inventory/trends" className="text-xs text-teal-400 hover:text-teal-300">
              View trends
            </Link>
          </div>
          {topConsumed.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">No consumption data yet</p>
          ) : (
            <div className="space-y-2">
              {topConsumed.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-surface-border/50 last:border-0">
                  <span className="text-xs text-zinc-500 w-5">{i + 1}.</span>
                  <span className="text-sm text-zinc-200 flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-orange-400 font-medium">
                    {item.total_consumed.toLocaleString()} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      {recentMoves.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-zinc-400" />
            Recent Movements
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border/50">
                  <th className="text-left text-xs text-zinc-400 pb-2 pr-4">Item</th>
                  <th className="text-left text-xs text-zinc-400 pb-2 pr-4">Type</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 pr-4">Delta</th>
                  <th className="text-right text-xs text-zinc-400 pb-2">After</th>
                </tr>
              </thead>
              <tbody>
                {recentMoves.map((m) => (
                  <tr key={m.id} className="border-b border-surface-border/30 last:border-0">
                    <td className="py-2 pr-4 text-zinc-200 truncate max-w-[160px]">{m.item_name}</td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 capitalize">
                        {m.movement_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`py-2 pr-4 text-right font-mono text-xs font-medium ${m.quantity_delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}
                    </td>
                    <td className="py-2 text-right text-zinc-400 font-mono text-xs">
                      {m.quantity_after ?? '—'} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
