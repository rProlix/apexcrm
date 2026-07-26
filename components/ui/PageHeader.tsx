import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  leading,
  actions,
  meta,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
  leading?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'ui-page-header relative flex flex-col gap-5 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-start lg:justify-between',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <div className="brand-accent-surface ui-page-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border">
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          {leading && <div className="mb-3">{leading}</div>}
          {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
          <h1 className="ui-page-title">{title}</h1>
          {description && <p className="ui-page-subtitle">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      )}
    </header>
  )
}
