'use client'
// components/website-import/ImportStatusBadge.tsx
import { cn } from '@/lib/utils'
import type { ImportJobStatus } from '@/lib/website-import/types'

const STATUS_CONFIG: Record<
  ImportJobStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  queued:    { label: 'Queued',    dot: 'bg-white/30',     text: 'text-white/50',   bg: 'bg-white/5' },
  running:   { label: 'Running',   dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  completed: { label: 'Completed', dot: 'bg-emerald-400',  text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  failed:    { label: 'Failed',    dot: 'bg-red-400',      text: 'text-red-300',    bg: 'bg-red-400/10' },
  canceled:  { label: 'Canceled',  dot: 'bg-white/20',     text: 'text-white/40',   bg: 'bg-white/5' },
}

interface Props {
  status: ImportJobStatus
  size?:  'sm' | 'md'
}

export function ImportStatusBadge({ status, size = 'sm' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        cfg.bg,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      )}
    >
      <span className={cn('rounded-full flex-shrink-0', cfg.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      <span className={cfg.text}>{cfg.label}</span>
    </span>
  )
}
