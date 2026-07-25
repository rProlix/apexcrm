'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatePanelProps {
  title: string
  description: string
  icon?: LucideIcon
  action?: ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
  compact,
  className,
}: StatePanelProps) {
  return (
    <StatePanel
      title={title}
      description={description}
      icon={icon}
      action={action}
      compact={compact}
      className={className}
      tone="neutral"
    />
  )
}

export function ErrorState({
  title,
  description,
  action,
  compact,
  className,
}: Omit<StatePanelProps, 'icon'>) {
  return (
    <StatePanel
      title={title}
      description={description}
      icon={AlertTriangle}
      action={
        action ?? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ui-button-secondary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        )
      }
      compact={compact}
      className={className}
      tone="danger"
    />
  )
}

function StatePanel({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact,
  className,
  tone,
}: StatePanelProps & { tone: 'neutral' | 'danger' }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border text-center',
        compact ? 'min-h-36 p-5' : 'min-h-56 p-8',
        tone === 'danger'
          ? 'border-red-400/15 bg-red-400/[0.035]'
          : 'border-dashed border-white/10 bg-white/[0.018]',
        className
      )}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl border',
          tone === 'danger'
            ? 'border-red-400/20 bg-red-400/10 text-red-300'
            : 'border-white/8 bg-white/[0.035] text-white/35'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white/85">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-white/45">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
