'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

type TenantStatus = 'active' | 'inactive' | 'suspended'

interface TenantStatusButtonProps {
  tenantId: string
  currentStatus: TenantStatus | string
}

const STATUS_CONFIG: Record<TenantStatus, {
  label: string
  icon: React.ElementType
  className: string
  next: TenantStatus
  nextLabel: string
}> = {
  active: {
    label: 'Active',
    icon: CheckCircle2,
    className: 'bg-emerald-500/12 border-emerald-500/30 text-emerald-400 hover:bg-red-500/12 hover:border-red-500/30 hover:text-red-400',
    next: 'inactive',
    nextLabel: 'Deactivate',
  },
  inactive: {
    label: 'Inactive',
    icon: XCircle,
    className: 'bg-white/5 border-white/15 text-white/40 hover:bg-emerald-500/12 hover:border-emerald-500/30 hover:text-emerald-400',
    next: 'active',
    nextLabel: 'Activate',
  },
  suspended: {
    label: 'Suspended',
    icon: AlertCircle,
    className: 'bg-amber-500/12 border-amber-500/30 text-amber-400 hover:bg-emerald-500/12 hover:border-emerald-500/30 hover:text-emerald-400',
    next: 'active',
    nextLabel: 'Reactivate',
  },
}

export function TenantStatusButton({ tenantId, currentStatus }: TenantStatusButtonProps) {
  const [status, setStatus] = useState<TenantStatus>(
    (currentStatus as TenantStatus) in STATUS_CONFIG ? (currentStatus as TenantStatus) : 'inactive'
  )
  const [isPending, startTransition] = useTransition()
  const [isHovering, setIsHovering] = useState(false)

  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  function toggle() {
    const next = config.next
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/toggle-tenant-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, status: next }),
        })
        if (res.ok) setStatus(next)
      } catch {
        // state reverts on failure
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      title={`${config.nextLabel} business`}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border',
        'transition-all duration-200 whitespace-nowrap',
        isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer',
        config.className
      )}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span>
        {isHovering && !isPending ? config.nextLabel : config.label}
      </span>
    </button>
  )
}

export function SuspendButton({ tenantId, currentStatus, onStatusChange }: {
  tenantId: string
  currentStatus: TenantStatus | string
  onStatusChange?: (status: TenantStatus) => void
}) {
  const [isPending, startTransition] = useTransition()
  const isSuspended = currentStatus === 'suspended'

  function toggle() {
    const next: TenantStatus = isSuspended ? 'active' : 'suspended'
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/toggle-tenant-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, status: next }),
        })
        if (res.ok) onStatusChange?.(next)
      } catch {
        // no-op
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={isSuspended ? 'Lift suspension' : 'Suspend business'}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border',
        'transition-all duration-200 whitespace-nowrap cursor-pointer',
        isPending && 'opacity-50 cursor-wait',
        isSuspended
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20'
          : 'bg-amber-500/8 border-amber-500/20 text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-400'
      )}
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertCircle className="h-3 w-3" />}
      {isSuspended ? 'Unsuspend' : 'Suspend'}
    </button>
  )
}
