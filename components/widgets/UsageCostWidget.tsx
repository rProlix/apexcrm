'use client'

import { cn } from '@/lib/utils'
import type { WidgetDataUsage } from '@/lib/dashboard/types'

interface UsageCostWidgetProps {
  data: WidgetDataUsage
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function UsageCostWidget({ data }: UsageCostWidgetProps) {
  const total = data.total_cents

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest mb-1">Total This Cycle</p>
          <p className="text-3xl font-bold text-gold-400 tabular-nums">
            {formatCents(total)}
          </p>
        </div>
        <span className="text-xs text-white/25 border border-white/10 rounded-lg px-2 py-1">
          Current month
        </span>
      </div>

      {/* Breakdown */}
      {data.items.length > 0 ? (
        <div className="space-y-2.5">
          {data.items.map((item) => {
            const pct = total > 0 ? Math.round((item.cents / total) * 100) : 0
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-white/60 capitalize">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/35">{pct}%</span>
                    <span className="text-xs font-medium text-white/70 tabular-nums">
                      {formatCents(item.cents)}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: item.color, opacity: 0.7 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-white/25 py-4 text-center">No usage events this cycle.</p>
      )}
    </div>
  )
}
