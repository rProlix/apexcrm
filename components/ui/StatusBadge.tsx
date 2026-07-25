import {
  AlertCircle,
  AlertTriangle,
  Check,
  Circle,
  Clock3,
  MinusCircle,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { ElementType } from 'react'
import { cn } from '@/lib/utils'

export type StatusTone =
  | 'critical'
  | 'high'
  | 'warning'
  | 'info'
  | 'success'
  | 'processing'
  | 'neutral'
  | 'disabled'

const toneStyles: Record<StatusTone, string> = {
  critical: 'border-red-400/25 bg-red-400/10 text-red-200',
  high: 'border-orange-400/25 bg-orange-400/10 text-orange-200',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  info: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  processing: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
  neutral: 'border-white/10 bg-white/[0.045] text-white/65',
  disabled: 'border-white/8 bg-white/[0.025] text-white/38',
}

const iconByTone = {
  critical: ShieldAlert,
  high: AlertTriangle,
  warning: AlertCircle,
  info: Circle,
  success: Check,
  processing: Clock3,
  neutral: MinusCircle,
  disabled: X,
} satisfies Record<StatusTone, ElementType>

export function getStatusTone(status: string): StatusTone {
  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (
    ['urgent', 'critical', 'level_3', 'out_of_service', 'overdue', 'failed'].includes(normalized)
  ) {
    return 'critical'
  }
  if (['high', 'needs_attention'].includes(normalized)) return 'high'
  if (
    ['needs_review', 'waiting_for_parts', 'needs_appointment', 'pending', 'unassigned'].includes(
      normalized
    )
  ) {
    return 'warning'
  }
  if (['processing', 'in_progress', 'scheduled', 'assigned'].includes(normalized)) {
    return 'processing'
  }
  if (
    ['active', 'complete', 'completed', 'connected', 'published', 'resolved'].includes(normalized)
  ) {
    return 'success'
  }
  if (['disabled', 'disconnected', 'archived', 'dismissed'].includes(normalized)) {
    return 'disabled'
  }
  if (['normal', 'draft', 'open', 'low'].includes(normalized)) return 'neutral'
  return 'info'
}

export function StatusBadge({
  label,
  status,
  tone,
  icon = true,
  className,
}: {
  label?: string
  status: string
  tone?: StatusTone
  icon?: boolean
  className?: string
}) {
  const resolvedTone = tone ?? getStatusTone(status)
  const Icon =
    status.toLowerCase() === 'connected'
      ? Wifi
      : status.toLowerCase() === 'disconnected'
        ? WifiOff
        : iconByTone[resolvedTone]

  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium leading-5',
        toneStyles[resolvedTone],
        className
      )}
      data-status={status}
    >
      {icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{label ?? humanizeStatus(status)}</span>
    </span>
  )
}

function humanizeStatus(status: string): string {
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
