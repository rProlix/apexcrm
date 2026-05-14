'use client'

// components/inventory/InventoryTrendsClient.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BarChart2, TrendingDown, Package, AlertTriangle, RefreshCw, ShoppingBag } from 'lucide-react'
import type { InventoryTrendSummary } from '@/lib/inventory/types'

interface Props { tenantId: string }

export function InventoryTrendsClient({ tenantId }: Props) {
  const [trends, setTrends]   = useState<InventoryTrendSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [period, setPeriod]   = useState<'7d' | '30d'>('7d')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/inventory/trends')
      if (!res.ok) throw new Error('Failed to load trends')
      const data = await res.json()
      setTrends(data.trends)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-teal-400 animate-spin" />
        <span className="ml-3 text-zinc-400">Loading trends...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-red-400">{error}</p>
        <button onClick={() => void load()} className="mt-3 text-teal-400 text-sm underline">Retry</button>
      </div>
    )
  }

  const topProducts = period === '7d' ? trends?.top_store_products_7d ?? [] : trends?.top_store_products_30d ?? []
  const topConsumed = period === '7d' ? trends?.top_consumed_items_7d ?? [] : trends?.top_consumed_items_30d ?? []

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-purple-400" />
            Trends & Predictions
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Sales velocity, top sellers, and restock suggestions</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-surface-border bg-graphite-800/50 p-1 gap-1">
            <button
              onClick={() => setPeriod('7d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === '7d' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              7 Days
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === '30d' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              30 Days
            </button>
          </div>
          <button
            onClick={() => void load()}
            className="p-2 rounded-xl border border-surface-border text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!trends?.has_sufficient_data && (
        <div className="rounded-2xl border border-zinc-700/50 bg-graphite-800/50 p-6 text-center">
          <BarChart2 className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
          <p className="text-white font-medium">Not enough sales history yet</p>
          <p className="text-sm text-zinc-400 mt-1">Trends will appear after inventory movements are recorded</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Store Products */}
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            Top Store Products ({period})
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">No store sales data yet</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.product_id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-500 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{p.product_name}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.min(100, (p.total_sold / (topProducts[0]?.total_sold || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-amber-400 shrink-0">{p.total_sold} sold</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Consumed Inventory */}
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-orange-400" />
            Top Consumed Items ({period})
          </h2>
          {topConsumed.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">No consumption data yet</p>
          ) : (
            <div className="space-y-3">
              {topConsumed.map((item, i) => (
                <div key={item.item_id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-500 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.item_name}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400"
                        style={{ width: `${Math.min(100, (item.total_consumed / (topConsumed[0]?.total_consumed || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-orange-400 shrink-0">
                    {item.total_consumed.toFixed(1)} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Predictions */}
      {(trends?.predictions ?? []).length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            Predicted Stockouts
          </h2>
          <div className="space-y-3">
            {(trends?.predictions ?? []).map((pred) => (
              <div key={pred.item_id} className="flex items-center gap-4 py-2 border-b border-surface-border/30 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{pred.item_name}</p>
                  <p className="text-xs text-zinc-400">
                    {pred.current_quantity} {pred.unit} remaining
                    {pred.blended_velocity_daily !== null && ` · ${pred.blended_velocity_daily.toFixed(2)} ${pred.unit}/day`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {pred.estimated_days_remaining !== null ? (
                    <p className={`text-sm font-medium ${
                      pred.estimated_days_remaining <= 3  ? 'text-red-400'
                      : pred.estimated_days_remaining <= 7 ? 'text-orange-400'
                      : 'text-yellow-400'
                    }`}>
                      ~{pred.estimated_days_remaining}d left
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400">Insufficient data</p>
                  )}
                  {pred.predicted_stockout_at && (
                    <p className="text-xs text-zinc-500">
                      {new Date(pred.predicted_stockout_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Reorders */}
      {(trends?.suggested_reorders ?? []).length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-teal-400" />
            Suggested Reorders
          </h2>
          <div className="space-y-2">
            {(trends?.suggested_reorders ?? []).map((item) => (
              <div key={item.item_id} className="flex items-center gap-3 py-2.5 border-b border-surface-border/30 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{item.item_name}</p>
                  <p className="text-xs text-zinc-400">{item.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-teal-400">
                    Order {item.suggested_quantity} {item.unit}
                  </p>
                  <p className="text-xs text-zinc-400">Currently: {item.current_quantity} {item.unit}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Link
              href="/inventory/items"
              className="text-sm text-teal-400 hover:text-teal-300 underline"
            >
              Manage inventory items →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
