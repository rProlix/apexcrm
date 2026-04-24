'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { cardHover, fadeUp } from '@/lib/motion'

interface KpiCardProps {
  label:     string
  value:     string | number
  sub?:      string
  icon?:     React.ReactNode
  trend?:    { value: number; label: string }
  className?: string
}

export function KpiCard({ label, value, sub, icon, trend, className }: KpiCardProps) {
  const trendPositive = (trend?.value ?? 0) >= 0

  return (
    <motion.div
      variants={fadeUp}
      initial="rest"
      whileHover="hover"
      className={cn(
        'relative overflow-hidden rounded-2xl p-5',
        'premium-panel premium-border noise-overlay',
        'cursor-default select-none',
        className
      )}
    >
      <motion.div variants={cardHover} className="flex items-start justify-between gap-3">
        {/* Icon */}
        {icon && (
          <div className="shrink-0 h-10 w-10 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-400">
            {icon}
          </div>
        )}

        {/* Values */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1 truncate">{label}</p>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          {sub && (
            <p className="text-xs text-white/35 mt-0.5 truncate">{sub}</p>
          )}
        </div>

        {/* Trend badge */}
        {trend && (
          <div
            className={cn(
              'shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full',
              trendPositive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            )}
          >
            {trendPositive ? '+' : ''}{trend.value}% {trend.label}
          </div>
        )}
      </motion.div>

      {/* Subtle gold glow in corner */}
      <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gold-500/5 blur-2xl" />
    </motion.div>
  )
}
