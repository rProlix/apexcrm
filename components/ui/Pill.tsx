import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'

interface PillProps {
  label: string
  status?: string
  className?: string
  color?: string // override status color
}

export function Pill({ label, status, className, color }: PillProps) {
  if (status && !color) {
    return <StatusBadge label={label} status={status} className={className} />
  }

  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.045] px-2 py-0.5 text-xs font-medium',
        color ?? 'text-white/60',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {label}
    </span>
  )
}
