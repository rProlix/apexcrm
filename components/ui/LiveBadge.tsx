'use client'

import { cn } from '@/lib/utils'

interface LiveBadgeProps {
  label?: string
  className?: string
}

export function LiveBadge({ label = 'Live', className }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-lg border px-2 py-0.5',
        'border-emerald-400/20 bg-emerald-400/[0.08] text-xs font-medium text-emerald-200',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
      {label}
    </span>
  )
}
