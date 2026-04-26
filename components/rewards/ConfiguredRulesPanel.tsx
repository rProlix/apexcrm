'use client'
// components/rewards/ConfiguredRulesPanel.tsx
// Shows the punch card rules that have been saved to the rewards program.
// This is a read-only confirmation panel — editing happens in PunchCardForm above.
import { motion } from 'framer-motion'
import { Zap, CheckCircle2, Package, Gift } from 'lucide-react'
import type { PunchCardRule, ProductWithRewards } from '@/types/rewards'

interface Props {
  rules:    PunchCardRule[]
  products: ProductWithRewards[]
}

function rewardSummary(rule: PunchCardRule): string {
  switch (rule.reward_type) {
    case 'free_item':    return 'Free item'
    case 'percent_off':  return `${rule.reward_value ?? 0}% off`
    case 'fixed_off':    return `$${rule.reward_value ?? 0} off`
    case 'bonus_points': return `${rule.reward_value ?? 0} bonus pts`
    default:             return 'Reward'
  }
}

export function ConfiguredRulesPanel({ rules, products }: Props) {
  const active   = rules.filter((r) => r.enabled)
  const disabled = rules.filter((r) => !r.enabled)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-2xl overflow-hidden border-emerald-400/20"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">
            Active Rules — {active.length} enabled
            {disabled.length > 0 && <span className="text-white/30 font-normal ml-2">({disabled.length} disabled)</span>}
          </h2>
          <p className="text-xs text-white/40">
            These rules are live. Customer progress is tracked automatically on every purchase.
          </p>
        </div>
      </div>

      {/* Rule list */}
      <div className="divide-y divide-white/4">
        {rules.map((rule, i) => {
          const product = products.find((p) => p.id === rule.product_id)

          return (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`px-5 py-4 flex items-center gap-4 ${!rule.enabled ? 'opacity-40' : ''}`}
            >
              {/* Icon */}
              <div className={`h-9 w-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${rule.enabled ? 'bg-gold-400/10 border-gold-400/20' : 'bg-white/4 border-white/8'}`}>
                {product
                  ? <Package className={`h-4 w-4 ${rule.enabled ? 'text-gold-400' : 'text-white/30'}`} strokeWidth={1.75} />
                  : <Zap className={`h-4 w-4 ${rule.enabled ? 'text-gold-400' : 'text-white/30'}`} strokeWidth={1.75} />
                }
              </div>

              {/* Name + target */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-white truncate">{rule.name}</p>
                  {rule.enabled
                    ? <span className="text-xs px-1.5 py-0.5 rounded-md bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex-shrink-0">Active</span>
                    : <span className="text-xs px-1.5 py-0.5 rounded-md bg-white/4 border border-white/8 text-white/30 flex-shrink-0">Disabled</span>
                  }
                </div>
                <p className="text-xs text-white/40 mt-0.5">
                  {product ? `For: ${product.name}` : 'Applies to any purchase'}
                </p>
              </div>

              {/* Goal */}
              <div className="text-center flex-shrink-0">
                <p className="text-lg font-bold text-amber-400 tabular-nums leading-none">{rule.punch_goal}</p>
                <p className="text-xs text-white/30 mt-0.5">purchases</p>
              </div>

              {/* Arrow */}
              <div className="text-white/20 flex-shrink-0">→</div>

              {/* Reward */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="h-7 w-7 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
                  <Gift className="h-3.5 w-3.5 text-gold-400" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gold-400">{rewardSummary(rule)}</p>
                  <p className="text-xs text-white/30 capitalize">{rule.reward_type.replace('_', ' ')}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Footer tip */}
      <div className="px-5 py-3 border-t border-white/6 bg-white/2">
        <p className="text-xs text-white/30">
          Edit these rules using the form above, then click Save. Changes apply to new purchases immediately.
          Existing customer progress is preserved.
        </p>
      </div>
    </motion.div>
  )
}
