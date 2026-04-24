import { cn } from '@/lib/utils'
import { statusColor } from '@/lib/utils'

interface PillProps {
  label:     string
  status?:   string
  className?: string
  color?:    string  // override status color
}

export function Pill({ label, status, className, color }: PillProps) {
  const textColor = color ?? (status ? statusColor(status) : 'text-white/60')

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        'bg-white/5 border border-white/8',
        textColor,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current opacity-80')} />
      {label}
    </span>
  )
}
