'use client'

import { cn }             from '@/lib/utils'
import {
  PLAN_CATALOG,
  formatPlanPrice,
  type CRMPlanKey,
  type CRMModuleKey,
} from '@/lib/plans/planCatalog'

interface PlanCardData {
  key:                         CRMPlanKey
  name:                        string
  description:                 string
  price_monthly_cents:         number
  price_yearly_cents:          number | null
  is_custom:                   boolean
  badge?:                      string
  is_recommended:              boolean
  included_modules:            CRMModuleKey[]
  highlight_features:          string[]
  limits:                      Record<string, number | null | undefined>
  includes_custom_domain:      boolean
  includes_white_label_email:  boolean
  includes_ai_builder:         boolean
  includes_advanced_analytics: boolean
}

interface PlanComparisonCardsProps {
  plans:             PlanCardData[]
  selectedPlanKey?:  CRMPlanKey
  onSelectPlan:      (key: CRMPlanKey) => void
  billingInterval?:  'monthly' | 'yearly'
  onToggleBilling?:  () => void
  highlightKey?:     CRMPlanKey
}

export function PlanComparisonCards({
  plans,
  selectedPlanKey,
  onSelectPlan,
  billingInterval = 'monthly',
  onToggleBilling,
  highlightKey,
}: PlanComparisonCardsProps) {
  return (
    <div className="space-y-4">
      {/* Billing toggle */}
      {onToggleBilling && (
        <div className="flex items-center justify-center gap-3">
          <span className={cn('text-sm', billingInterval === 'monthly' ? 'text-white' : 'text-white/40')}>
            Monthly
          </span>
          <button
            type="button"
            onClick={onToggleBilling}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200',
              billingInterval === 'yearly' ? 'bg-gold-500' : 'bg-graphite-600'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                billingInterval === 'yearly' ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
          <span className={cn('text-sm', billingInterval === 'yearly' ? 'text-white' : 'text-white/40')}>
            Yearly <span className="text-xs text-green-400 ml-1">Save 20%</span>
          </span>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {plans.map((plan) => {
          const isSelected    = selectedPlanKey === plan.key
          const isHighlighted = highlightKey === plan.key
          const price         = billingInterval === 'yearly' && plan.price_yearly_cents
            ? `$${Math.floor(plan.price_yearly_cents / 100 / 12)}`
            : formatPlanPrice(plan.key, 'monthly')

          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => onSelectPlan(plan.key)}
              className={cn(
                'relative text-left rounded-2xl border p-4 transition-all duration-200 focus:outline-none',
                isSelected
                  ? 'border-gold-500/70 bg-gold-500/10 shadow-glow-gold'
                  : isHighlighted
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-graphite-600 bg-graphite-800/50 hover:border-graphite-500 hover:bg-graphite-800',
              )}
            >
              {/* Recommended / badge */}
              {(plan.is_recommended || plan.badge) && (
                <div className="absolute -top-3 left-4">
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    plan.is_recommended
                      ? 'bg-gold-gradient text-graphite-900'
                      : 'bg-graphite-700 text-white/70 border border-graphite-600'
                  )}>
                    {plan.is_recommended ? '★ Recommended' : plan.badge}
                  </span>
                </div>
              )}

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <div className="h-5 w-5 rounded-full bg-gold-500 flex items-center justify-center">
                    <svg className="h-3 w-3 text-graphite-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}

              <div className="mt-1 mb-3">
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-3">
                {plan.is_custom ? (
                  <p className="text-2xl font-bold text-white">Custom</p>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">{price}</span>
                    <span className="text-xs text-white/40">/mo</span>
                    {billingInterval === 'yearly' && !plan.is_custom && (
                      <span className="ml-2 text-xs text-green-400">billed yearly</span>
                    )}
                  </div>
                )}
              </div>

              {/* Feature list */}
              <ul className="space-y-1">
                {plan.highlight_features.slice(0, 5).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                    <span className="h-3.5 w-3.5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center shrink-0 text-[10px]">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
                {plan.highlight_features.length > 5 && (
                  <li className="text-xs text-white/30 pl-5.5">
                    +{plan.highlight_features.length - 5} more features
                  </li>
                )}
              </ul>

              {/* Premium badges */}
              <div className="mt-3 flex flex-wrap gap-1">
                {plan.includes_ai_builder && (
                  <span className="rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0.5">
                    AI Builder
                  </span>
                )}
                {plan.key === 'pro' || plan.key === 'enterprise' ? (
                  <span className="rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] px-1.5 py-0.5">
                    360 Studio
                  </span>
                ) : null}
                {plan.includes_custom_domain && (
                  <span className="rounded-md bg-green-500/10 border border-green-500/20 text-green-300 text-[10px] px-1.5 py-0.5">
                    Custom Domain
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
