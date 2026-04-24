'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { cardHover, fadeUp } from '@/lib/motion'
import type { ResolvedStat } from '@/modules/shared/moduleTypes'

interface AdaptiveStatCardProps {
  stat:      ResolvedStat
  index?:    number
}

export function AdaptiveStatCard({ stat, index = 0 }: AdaptiveStatCardProps) {
  const accentColor = stat.color ?? 'text-gold-400'

  return (
    <motion.div
      variants={fadeUp}
      initial="rest"
      whileHover="hover"
      custom={index}
    >
      <motion.div
        variants={cardHover}
        className={cn(
          'relative overflow-hidden rounded-2xl p-5',
          'premium-panel premium-border noise-overlay',
          'group cursor-default select-none',
          'transition-shadow duration-300 hover:shadow-panel-lg'
        )}
      >
        {/* Label */}
        <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3 truncate">
          {stat.label}
        </p>

        {/* Value */}
        {stat.isEmpty ? (
          <div>
            <p className={cn('text-2xl font-bold tabular-nums', 'text-white/15')}>—</p>
            <p className="text-xs text-white/25 mt-1.5">{stat.emptyMessage}</p>
          </div>
        ) : (
          <p className={cn('text-2xl font-bold tabular-nums tracking-tight', accentColor)}>
            {stat.formatted}
          </p>
        )}

        {/* Accent glow — bottom-right corner */}
        <div
          className={cn(
            'pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-0',
            'group-hover:opacity-30 transition-opacity duration-300',
            accentColor.replace('text-', 'bg-')
          )}
        />

        {/* Top-left accent line */}
        <div
          className={cn(
            'absolute top-0 left-5 h-px w-8 opacity-40',
            accentColor.replace('text-', 'bg-')
          )}
        />
      </motion.div>
    </motion.div>
  )
}
