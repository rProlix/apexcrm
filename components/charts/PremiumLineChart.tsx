'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { cn } from '@/lib/utils'

interface DataPoint {
  date:  string
  value: number
}

interface PremiumLineChartProps {
  data:       DataPoint[]
  color?:     string   // hex stroke color, default gold
  height?:    number
  formatY?:   (v: number) => string
  formatX?:   (d: string) => string
  className?: string
  gradientId?: string
}

function defaultFormatX(d: string): string {
  const date = new Date(d)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

// Custom tooltip
function PremiumTooltip({ active, payload, label, formatY }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-graphite-800 border border-white/10 rounded-xl px-3 py-2 shadow-panel text-xs">
      <p className="text-white/40 mb-1">{label}</p>
      <p className="font-bold text-gold-400">
        {formatY ? formatY(payload[0].value) : payload[0].value}
      </p>
    </div>
  )
}

export function PremiumLineChart({
  data,
  color      = '#c9a84c',
  height     = 160,
  formatY,
  formatX    = defaultFormatX,
  className,
  gradientId = 'premiumLine',
}: PremiumLineChartProps) {
  // Show every ~7th label to avoid crowding
  const tickIndices = new Set(
    data
      .map((_, i) => i)
      .filter((i) => i % 7 === 0 || i === data.length - 1)
  )

  const formattedData = data.map((d, i) => ({
    ...d,
    displayDate: tickIndices.has(i) ? formatX(d.date) : '',
  }))

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={color} stopOpacity={0.6} />
              <stop offset="50%"  stopColor={color} stopOpacity={1}   />
              <stop offset="100%" stopColor={color} stopOpacity={0.6} />
            </linearGradient>
            {/* Glow filter */}
            <filter id={`${gradientId}-glow`} x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />

          <XAxis
            dataKey="displayDate"
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatY}
          />

          <Tooltip
            content={<PremiumTooltip formatY={formatY} />}
            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
          />

          <Line
            type="monotone"
            dataKey="value"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }}
            filter={`url(#${gradientId}-glow)`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
