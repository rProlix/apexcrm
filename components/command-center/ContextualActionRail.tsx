import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ContextualAction {
  label: string
  description?: string
  href: string
  icon?: LucideIcon
  primary?: boolean
}

export function ContextualActionRail({
  title = 'Record actions',
  actions,
}: {
  title?: string
  actions: ContextualAction[]
}) {
  if (actions.length === 0) return null

  const content = (
    <nav aria-label={title} className="space-y-2">
      {actions.map((action) => {
        const Icon = action.icon ?? ArrowUpRight
        return (
          <Link
            key={`${action.href}:${action.label}`}
            href={action.href}
            className={cn(
              'focus-ring group flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
              action.primary
                ? 'border-brand/30 bg-brand/[0.09] text-white hover:bg-brand/[0.13]'
                : 'border-white/[0.075] bg-white/[0.025] text-white/68 hover:border-white/12 hover:bg-white/[0.045] hover:text-white'
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{action.label}</span>
              {action.description && (
                <span className="mt-0.5 block text-xs leading-5 text-white/35">
                  {action.description}
                </span>
              )}
            </span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      <details className="ui-surface overflow-hidden 2xl:hidden">
        <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-white/80 [&::-webkit-details-marker]:hidden">
          <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" />
          {title}
          <span className="ml-auto text-xs font-normal text-white/35">
            {actions.length} available
          </span>
        </summary>
        <div className="border-t border-white/[0.075] p-3">{content}</div>
      </details>
      <aside className="sticky top-20 hidden self-start 2xl:block" aria-label={title}>
        <div className="ui-surface p-3">
          <div className="mb-3 flex items-center gap-2 px-1">
            <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white/80">{title}</h2>
          </div>
          {content}
        </div>
      </aside>
    </>
  )
}
