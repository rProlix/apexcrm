'use client'
// components/website-import/ConfidenceMeter.tsx
import { cn } from '@/lib/utils'

interface Props {
  score:      number   // 0–1
  showLabel?: boolean
  size?:      'xs' | 'sm' | 'md'
}

function getColor(score: number): string {
  if (score >= 0.8) return 'bg-emerald-400'
  if (score >= 0.6) return 'bg-amber-400'
  if (score >= 0.4) return 'bg-orange-400'
  return 'bg-red-400/70'
}

function getLabel(score: number): string {
  if (score >= 0.85) return 'High'
  if (score >= 0.65) return 'Medium'
  if (score >= 0.40) return 'Low'
  return 'Very Low'
}

function getLabelColor(score: number): string {
  if (score >= 0.85) return 'text-emerald-300'
  if (score >= 0.65) return 'text-amber-300'
  if (score >= 0.40) return 'text-orange-300'
  return 'text-red-300'
}

export function ConfidenceMeter({ score, showLabel = true, size = 'sm' }: Props) {
  const pct   = Math.max(0, Math.min(1, score)) * 100
  const color = getColor(score)

  const barHeight = size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2'
  const barWidth  = size === 'xs' ? 'w-12' : size === 'sm' ? 'w-16' : 'w-24'

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('rounded-full bg-white/10 overflow-hidden flex-shrink-0', barWidth, barHeight)}>
        <span
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </span>
      {showLabel && (
        <span className={cn('text-xs font-medium tabular-nums', getLabelColor(score))}>
          {getLabel(score)} <span className="text-white/30">({Math.round(pct)}%)</span>
        </span>
      )}
    </span>
  )
}
