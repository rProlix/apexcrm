// components/appointments/StatusBadge.tsx
'use client'

import type { AppointmentStatus } from '@/lib/appointments/types'

const CONFIG: Record<AppointmentStatus, { label: string; className: string }> = {
  pending:    { label: 'Pending',     className: 'bg-amber-400/10   text-amber-400   border-amber-400/20'   },
  confirmed:  { label: 'Confirmed',   className: 'bg-gold-400/10    text-gold-400    border-gold-400/20'    },
  completed:  { label: 'Completed',   className: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
  canceled:   { label: 'Canceled',    className: 'bg-red-400/10     text-red-400     border-red-400/20'     },
  no_show:    { label: 'No Show',     className: 'bg-red-900/20     text-red-300     border-red-800/30'     },
  rescheduled:{ label: 'Rescheduled', className: 'bg-blue-400/10    text-blue-400    border-blue-400/20'    },
}

interface Props {
  status: AppointmentStatus | string
  size?:  'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const cfg = CONFIG[status as AppointmentStatus] ?? {
    label:     status,
    className: 'bg-white/5 text-white/40 border-white/10',
  }

  const sizeClass = size === 'md'
    ? 'px-3 py-1 text-xs font-semibold'
    : 'px-2 py-0.5 text-2xs font-medium'

  return (
    <span className={`inline-flex items-center rounded-full border ${sizeClass} ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
