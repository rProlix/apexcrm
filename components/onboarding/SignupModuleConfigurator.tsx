'use client'

import { useMemo, useState } from 'react'
import {
  BriefcaseBusiness,
  Check,
  Cpu,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModuleKey } from '@/modules/shared/moduleTypes'
import {
  addSignupModuleWithDependencies,
  ANNUAL_DISCOUNT_PERCENT,
  calculateSignupQuote,
  formatSignupPrice,
  removeSignupModuleWithDependents,
  SIGNUP_MODULE_OFFERS,
  type SignupBillingInterval,
  type SignupModuleCategory,
} from '@/lib/plans/signupModulePricing'

const CATEGORY_DETAILS: Record<SignupModuleCategory, { name: string; icon: typeof UsersRound }> = {
  relationships: { name: 'Relationships', icon: UsersRound },
  operations: { name: 'Operations', icon: BriefcaseBusiness },
  commerce: { name: 'Commerce', icon: ShoppingBag },
  intelligence: { name: 'AI & Intelligence', icon: Cpu },
}

const CATEGORY_ORDER: SignupModuleCategory[] = [
  'operations',
  'relationships',
  'commerce',
  'intelligence',
]

type SignupModuleConfiguratorProps = {
  packageName: string
  packageDescription: string
  selectedModules: ModuleKey[]
  recommendedModules: ModuleKey[]
  billingInterval: SignupBillingInterval
  onSelectionChange: (modules: ModuleKey[]) => void
  onBillingIntervalChange: (interval: SignupBillingInterval) => void
}

export function SignupModuleConfigurator({
  packageName,
  packageDescription,
  selectedModules,
  recommendedModules,
  billingInterval,
  onSelectionChange,
  onBillingIntervalChange,
}: SignupModuleConfiguratorProps) {
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null)
  const selectedSet = useMemo(() => new Set(selectedModules), [selectedModules])
  const recommendedSet = useMemo(() => new Set(recommendedModules), [recommendedModules])
  const quote = calculateSignupQuote(selectedModules, billingInterval)

  function toggleModule(moduleKey: ModuleKey) {
    setSelectionNotice(null)

    if (selectedSet.has(moduleKey)) {
      const nextSelection = removeSignupModuleWithDependents(selectedModules, moduleKey)
      if (
        moduleKey === 'vehicles' &&
        (selectedSet.has('damage_ai') || selectedSet.has('maintenance'))
      ) {
        setSelectionNotice(
          'Fleet was removed with Van Damage AI and Fleet Maintenance because those tools depend on vehicle profiles.'
        )
      }
      onSelectionChange(nextSelection)
      return
    }

    const nextSelection = addSignupModuleWithDependencies(selectedModules, moduleKey)
    if (
      (moduleKey === 'damage_ai' || moduleKey === 'maintenance') &&
      !selectedSet.has('vehicles')
    ) {
      setSelectionNotice(
        `Fleet was included automatically because ${moduleKey === 'damage_ai' ? 'Van Damage AI' : 'Fleet Maintenance'} needs vehicle profiles.`
      )
    }
    onSelectionChange(nextSelection)
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-gold-500/25 bg-[linear-gradient(135deg,rgba(201,168,76,0.14),rgba(18,18,20,0.84)_58%)] p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-gold-400/20 bg-gold-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-300">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Recommended package
            </div>
            <h3 className="text-base font-semibold text-white">{packageName}</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{packageDescription}</p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-2xl font-semibold tracking-tight text-white">
              {formatSignupPrice(quote.monthlyPriceCents)}
              <span className="ml-1 text-xs font-normal text-white/40">/mo</span>
            </p>
            <p className="mt-1 text-[11px] text-white/35">
              {selectedModules.length} module
              {selectedModules.length === 1 ? '' : 's'} + platform
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-graphite-700 bg-graphite-900/45 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-white/75">Billing schedule</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Annual billing saves {ANNUAL_DISCOUNT_PERCENT}%.
          </p>
        </div>
        <div
          className="grid grid-cols-2 rounded-lg border border-graphite-600 bg-graphite-950/70 p-1"
          aria-label="Billing schedule"
        >
          {(['monthly', 'yearly'] as const).map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() => onBillingIntervalChange(interval)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                billingInterval === interval
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70'
              )}
              aria-pressed={billingInterval === interval}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Tailor your workspace</h3>
          <p className="mt-0.5 text-xs text-white/40">
            Add or remove modules and your quote updates immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelectionChange(recommendedModules)
            setSelectionNotice('Your recommended package has been restored.')
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-graphite-600 px-2.5 py-2 text-[11px] font-medium text-white/50 transition-colors hover:border-graphite-500 hover:text-white"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset
        </button>
      </div>

      {selectionNotice && (
        <div
          className="rounded-xl border border-blue-400/20 bg-blue-400/[0.07] px-3.5 py-3 text-xs leading-relaxed text-blue-200/80"
          role="status"
        >
          {selectionNotice}
        </div>
      )}

      <div className="space-y-5">
        {CATEGORY_ORDER.map((category) => {
          const details = CATEGORY_DETAILS[category]
          const Icon = details.icon
          const modules = SIGNUP_MODULE_OFFERS.filter((module) => module.category === category)

          return (
            <section key={category}>
              <div className="mb-2.5 flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-white/35" aria-hidden="true" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {details.name}
                </h4>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {modules.map((module) => {
                  const isSelected = selectedSet.has(module.key)
                  const isRecommended = recommendedSet.has(module.key)

                  return (
                    <button
                      key={module.key}
                      type="button"
                      onClick={() => toggleModule(module.key)}
                      className={cn(
                        'group relative min-h-28 rounded-xl border p-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99]',
                        isSelected
                          ? 'border-gold-500/55 bg-gold-500/[0.08]'
                          : 'border-graphite-700 bg-graphite-900/35 hover:border-graphite-500 hover:bg-graphite-800/50'
                      )}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                'text-xs font-semibold',
                                isSelected ? 'text-white' : 'text-white/75'
                              )}
                            >
                              {module.name}
                            </span>
                            {isRecommended && (
                              <span className="rounded-full bg-gold-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gold-300/80">
                                Suggested
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
                            {module.description}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                            isSelected
                              ? 'border-gold-400 bg-gold-400 text-graphite-950'
                              : 'border-graphite-500 text-transparent'
                          )}
                          aria-hidden="true"
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium text-white/65">
                        +{formatSignupPrice(module.monthlyPriceCents)}/mo
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <section className="rounded-xl border border-graphite-700 bg-graphite-900/45 p-4">
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-4 text-white/45">
            <span>Nexora workspace platform</span>
            <span>{formatSignupPrice(quote.basePriceCents)}/mo</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-white/45">
            <span>{selectedModules.length} selected modules</span>
            <span>{formatSignupPrice(quote.modulesPriceCents)}/mo</span>
          </div>
          {billingInterval === 'yearly' && (
            <div className="flex items-center justify-between gap-4 text-emerald-300/80">
              <span>Annual billing savings</span>
              <span>-{formatSignupPrice(quote.annualSavingsCents)}/yr</span>
            </div>
          )}
          <div className="my-3 h-px bg-white/[0.07]" />
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-semibold text-white">Your subscription</p>
              <p className="mt-0.5 text-[11px] text-white/35">
                14-day trial, then billed {billingInterval}.
              </p>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatSignupPrice(quote.monthlyPriceCents)}
              <span className="ml-1 text-[11px] font-normal text-white/35">/mo</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
