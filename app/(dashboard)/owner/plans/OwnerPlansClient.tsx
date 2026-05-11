'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { PlanDefinition, CRMPlanKey } from '@/lib/plans/planCatalog'
import type { MODULE_CATALOG } from '@/lib/plans/planCatalog'

interface Subscription {
  id:                 string
  tenant_id:          string
  plan_key:           string
  status:             string
  billing_interval:   string
  trial_ends_at:      string | null
  current_period_end: string | null
  created_at:         string
  tenants:            { name: string; slug: string } | null
}

interface OwnerPlansClientProps {
  plans:         PlanDefinition[]
  modules:       typeof MODULE_CATALOG
  subscriptions: Subscription[]
}

export function OwnerPlansClient({ plans, subscriptions }: OwnerPlansClientProps) {
  const [tab, setTab] = useState<'plans' | 'subscriptions'>('plans')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Plan Management</h1>
        <p className="text-sm text-white/40 mt-1">View and manage CRM plans, module assignments, and tenant subscriptions.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-graphite-800/60 border border-graphite-700 p-1 w-fit">
        {(['plans', 'subscriptions'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-all capitalize',
              tab === t
                ? 'bg-gold-gradient text-graphite-900'
                : 'text-white/50 hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Plans tab */}
      {tab === 'plans' && (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      )}

      {/* Subscriptions tab */}
      {tab === 'subscriptions' && (
        <div className="space-y-3">
          <p className="text-xs text-white/40">
            {subscriptions.length} active tenant subscription{subscriptions.length !== 1 ? 's' : ''}
          </p>
          <div className="rounded-2xl border border-graphite-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-graphite-700 bg-graphite-800/40">
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Business</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Billing</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Period end</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-white/30 text-sm">
                      No subscriptions found.
                    </td>
                  </tr>
                )}
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-b border-graphite-800 last:border-0 hover:bg-graphite-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{sub.tenants?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-white/35 font-mono">{sub.tenants?.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge planKey={sub.plan_key as CRMPlanKey} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs capitalize">
                      {sub.billing_interval}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString()
                        : sub.trial_ends_at
                          ? `Trial ends ${new Date(sub.trial_ends_at).toLocaleDateString()}`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: PlanDefinition }) {
  return (
    <div className="rounded-2xl border border-graphite-600 bg-graphite-800/50 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-white">{plan.name}</h3>
          <p className="text-xs text-white/40 mt-0.5">{plan.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-white">
            {plan.is_custom ? 'Custom' : `$${Math.floor(plan.price_monthly_cents / 100)}`}
          </p>
          {!plan.is_custom && <p className="text-xs text-white/30">/month</p>}
        </div>
      </div>

      {/* Limits */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {plan.limits.max_staff != null && (
          <div className="text-xs text-white/50">👔 Up to {plan.limits.max_staff} staff</div>
        )}
        {plan.limits.max_customers != null && (
          <div className="text-xs text-white/50">👥 {plan.limits.max_customers.toLocaleString()} customers</div>
        )}
        {plan.limits.max_ai_generations_per_month != null && (
          <div className="text-xs text-white/50">✨ {plan.limits.max_ai_generations_per_month} AI gens/mo</div>
        )}
        {plan.limits.max_360_packages != null && (
          <div className="text-xs text-white/50">🔄 {plan.limits.max_360_packages} 360 pkgs</div>
        )}
      </div>

      {/* Modules */}
      <div>
        <p className="text-xs text-white/30 mb-2">{plan.included_modules.length} modules included</p>
        <div className="flex flex-wrap gap-1">
          {plan.included_modules.slice(0, 8).map((key) => (
            <span key={key} className="rounded-md bg-graphite-700 text-white/50 text-[10px] px-2 py-0.5">
              {key}
            </span>
          ))}
          {plan.included_modules.length > 8 && (
            <span className="text-[10px] text-white/25">+{plan.included_modules.length - 8} more</span>
          )}
        </div>
      </div>

      {/* Premium features */}
      <div className="mt-3 flex flex-wrap gap-1">
        {plan.includes_ai_builder && (
          <span className="rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0.5">AI Builder</span>
        )}
        {plan.includes_custom_domain && (
          <span className="rounded-md bg-green-500/10 border border-green-500/20 text-green-300 text-[10px] px-1.5 py-0.5">Custom Domain</span>
        )}
        {plan.includes_advanced_analytics && (
          <span className="rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] px-1.5 py-0.5">Advanced Analytics</span>
        )}
      </div>
    </div>
  )
}

function PlanBadge({ planKey }: { planKey: CRMPlanKey }) {
  const colors: Record<CRMPlanKey, string> = {
    starter:    'bg-graphite-700 text-white/60',
    growth:     'bg-blue-500/10 text-blue-300 border-blue-500/20',
    pro:        'bg-gold-500/10 text-gold-400 border-gold-500/20',
    enterprise: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  }
  return (
    <span className={cn('rounded-lg border px-2 py-0.5 text-xs font-medium capitalize', colors[planKey] ?? colors.starter)}>
      {planKey}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial:      'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    trialing:   'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    active:     'bg-green-500/10 text-green-300 border-green-500/20',
    past_due:   'bg-red-500/10 text-red-300 border-red-500/20',
    cancelled:  'bg-graphite-700 text-white/40',
    incomplete: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    unpaid:     'bg-red-500/10 text-red-300 border-red-500/20',
  }
  return (
    <span className={cn('rounded-lg border px-2 py-0.5 text-xs font-medium capitalize', colors[status] ?? 'bg-graphite-700 text-white/40')}>
      {status}
    </span>
  )
}
