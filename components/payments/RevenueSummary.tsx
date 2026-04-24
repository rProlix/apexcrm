'use client'
// components/payments/RevenueSummary.tsx
import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface DailyRevenue {
  date:   string
  amount: number
  count:  number
}

interface Props {
  dailyRevenue: DailyRevenue[]
  currency:     string
}

export function RevenueSummary({ dailyRevenue, currency }: Props) {
  const filled = useMemo(() => {
    if (dailyRevenue.length === 0) return []
    return dailyRevenue.map((d) => ({
      ...d,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))
  }, [dailyRevenue])

  const total = dailyRevenue.reduce((s, d) => s + d.amount, 0)

  return (
    <div className="premium-panel premium-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-white/40 mb-1">30-Day Revenue</p>
          <p className="text-2xl font-bold text-gold-400">{formatCurrency(total, currency)}</p>
        </div>
        <span className="text-xs text-white/30 border border-white/10 rounded-lg px-2 py-1">Last 30 days</span>
      </div>

      {filled.length > 0 ? (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={filled} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#c9a84c" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#c9a84c" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background:  'rgba(20,20,20,0.95)',
                border:      '1px solid rgba(201,168,76,0.2)',
                borderRadius: '12px',
                fontSize:    '12px',
                color:       '#fff',
              }}
              formatter={(v: number) => [formatCurrency(v, currency), 'Revenue']}
              labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#c9a84c"
              strokeWidth={2}
              fill="url(#goldGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#c9a84c', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[140px] flex items-center justify-center">
          <p className="text-sm text-white/20">No revenue data yet</p>
        </div>
      )}
    </div>
  )
}
