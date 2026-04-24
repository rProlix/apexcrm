'use client'

import { PremiumLineChart } from '@/components/charts/PremiumLineChart'
import type { WidgetDataChart } from '@/lib/dashboard/types'

interface UsageChartWidgetProps {
  data: WidgetDataChart
}

export function UsageChartWidget({ data }: UsageChartWidgetProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-white/35 uppercase tracking-widest">{data.label}</p>
        <span className="text-xs text-white/20">30 days</span>
      </div>
      <PremiumLineChart
        data={data.points}
        color={data.color ?? '#a78bfa'}
        height={140}
        gradientId="usageLine"
      />
    </div>
  )
}
