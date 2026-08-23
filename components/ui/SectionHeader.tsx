import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  meta?: ReactNode
  action?: ReactNode
  className?: string
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  meta,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('ui-section-header', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="ui-section-eyebrow">{eyebrow}</p>}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="ui-section-title">{title}</h2>
          {meta && <div className="ui-section-meta">{meta}</div>}
        </div>
        {description && <p className="ui-section-description">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
