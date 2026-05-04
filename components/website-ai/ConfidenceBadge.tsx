'use client'
// components/website-ai/ConfidenceBadge.tsx

import { cn } from '@/lib/utils'

interface Props {
  confidence: number
  size?: 'sm' | 'md'
}

export function ConfidenceBadge({ confidence, size = 'sm' }: Props) {
  const pct = Math.round(confidence * 100)

  const { label, classes } =
    pct >= 85 ? { label: `${pct}%`, classes: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20 shadow-emerald-500/10' } :
    pct >= 60 ? { label: `${pct}%`, classes: 'bg-gold-500/12 text-gold-400 border-gold-500/20 shadow-gold-500/10' } :
                { label: `${pct}%`, classes: 'bg-white/8 text-white/40 border-white/10' }

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold border rounded-md',
        size === 'sm' ? 'text-2xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        classes,
      )}
    >
      {label}
    </span>
  )
}
