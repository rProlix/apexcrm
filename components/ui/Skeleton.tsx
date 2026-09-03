import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-skeleton', className)} aria-hidden="true" {...props} />
}

interface PageSkeletonProps {
  cards?: number
  label?: string
}

export function PageSkeleton({ cards = 4, label = 'Loading workspace' }: PageSkeletonProps) {
  return (
    <div
      className="ui-page ui-loading-sequence space-y-7"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>

      <div className="flex items-start justify-between gap-6">
        <div className="w-full space-y-3">
          <Skeleton className="h-7 w-56 max-w-[70%]" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <p
          className="hidden shrink-0 pt-1 text-xs font-medium text-white/35 sm:block"
          aria-hidden="true"
        >
          {label}
        </p>
      </div>

      <div className="ui-loading-card-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>

      <Skeleton className="h-80 rounded-2xl" />
    </div>
  )
}

export function ApplicationLoadingScreen({ label = 'Loading workspace' }: { label?: string }) {
  return (
    <div className="min-h-dvh bg-graphite-950">
      <div className="flex min-h-16 items-center gap-3 border-b border-white/[0.065] bg-graphite-900/88 px-4 md:px-6">
        <div className="ui-skeleton h-9 w-9 rounded-xl" aria-hidden="true" />
        <div>
          <div className="ui-skeleton mb-1.5 h-3 w-28 rounded" aria-hidden="true" />
          <p className="text-xs text-white/35">{label}</p>
        </div>
      </div>

      <main className="px-[var(--space-page-x)] py-[var(--space-page-y)]">
        <PageSkeleton label={label} />
      </main>
    </div>
  )
}
