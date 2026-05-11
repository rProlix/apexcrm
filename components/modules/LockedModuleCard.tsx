'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MODULE_CATALOG, PLAN_CATALOG, type CRMModuleKey, type CRMPlanKey } from '@/lib/plans/planCatalog'

interface LockedModuleCardProps {
  moduleKey:     string
  lockedReason?: string | null
  className?:    string
}

/**
 * Shown in place of a module's content when it's locked by the tenant's plan.
 * Displays a friendly upgrade message with the minimum plan required.
 */
export function LockedModuleCard({ moduleKey, lockedReason, className }: LockedModuleCardProps) {
  const catalog  = MODULE_CATALOG[moduleKey as CRMModuleKey]
  const minPlan  = catalog?.minPlan ?? 'pro'
  const planName = PLAN_CATALOG[minPlan as CRMPlanKey]?.name ?? 'Pro'

  const defaultReason = catalog
    ? `${catalog.label} is included in the ${planName} plan. Upgrade to unlock this feature.`
    : `This module requires a plan upgrade. Please contact support.`

  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center rounded-2xl border border-graphite-600',
      'bg-graphite-900/60 py-16 px-8',
      className
    )}>
      <div className="h-14 w-14 rounded-2xl bg-graphite-800 border border-graphite-600 flex items-center justify-center mb-4">
        <span className="text-2xl grayscale opacity-50">{catalog?.icon ?? '🔒'}</span>
      </div>

      <div className="mb-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-graphite-700 border border-graphite-600 px-2.5 py-1 text-xs text-white/40">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Requires {planName}
        </span>
      </div>

      <h2 className="text-lg font-bold text-white mb-2">
        {catalog?.label ?? moduleKey} is locked
      </h2>

      <p className="text-sm text-white/50 max-w-sm leading-relaxed mb-6">
        {lockedReason ?? defaultReason}
      </p>

      <Link
        href="/settings/billing"
        className="inline-flex items-center justify-center h-10 px-6 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
      >
        Upgrade to {planName}
      </Link>

      <p className="mt-3 text-xs text-white/25">
        Or{' '}
        <Link href="/settings" className="text-white/40 hover:text-white/60 underline transition-colors">
          view your current plan
        </Link>
      </p>
    </div>
  )
}

/**
 * HOC-style wrapper: renders children if module is enabled, otherwise shows LockedModuleCard.
 */
interface ModuleGuardProps {
  moduleKey:     string
  isLocked:      boolean
  lockedReason?: string | null
  children:      React.ReactNode
  className?:    string
}

export function ModuleGuard({ moduleKey, isLocked, lockedReason, children, className }: ModuleGuardProps) {
  if (isLocked) {
    return <LockedModuleCard moduleKey={moduleKey} lockedReason={lockedReason} className={className} />
  }
  return <>{children}</>
}
