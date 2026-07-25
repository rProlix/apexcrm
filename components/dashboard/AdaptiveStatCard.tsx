import { cn } from '@/lib/utils'
import type { ResolvedStat } from '@/modules/shared/moduleTypes'

interface AdaptiveStatCardProps {
  stat: ResolvedStat
  index?: number
}

export function AdaptiveStatCard({ stat }: AdaptiveStatCardProps) {
  const accentColor = stat.color ?? 'text-gold-400'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-5',
        'premium-panel premium-border',
        'cursor-default select-none transition-colors duration-200 hover:border-white/[0.13]'
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

      {/* A single restrained data accent reinforces the metric category. */}
      <div
        className={cn(
          'absolute top-0 left-5 h-px w-8 opacity-40',
          accentColor.replace('text-', 'bg-')
        )}
      />
    </div>
  )
}
