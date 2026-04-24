'use client'
// components/rewards/ProductRewardsSelector.tsx
// Allows admins to configure rewards settings per store product.
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Package, Save, Check } from 'lucide-react'
import type { ProductWithRewards } from '@/types/rewards'

interface Props {
  tenantId: string
  products: ProductWithRewards[]
}

interface ProductRewardsState {
  rewards_enabled:       boolean
  rewards_points_earned: number | null
  rewards_multiplier:    number
}

export function ProductRewardsSelector({ products }: Props) {
  const [isPending, startTransition] = useTransition()
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const [configs, setConfigs] = useState<Record<string, ProductRewardsState>>(() =>
    Object.fromEntries(
      products.map((p) => [
        p.id,
        {
          rewards_enabled:       p.rewards_enabled,
          rewards_points_earned: p.rewards_points_earned,
          rewards_multiplier:    p.rewards_multiplier,
        },
      ])
    )
  )

  function updateConfig(id: string, key: keyof ProductRewardsState, value: unknown) {
    setConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }))
  }

  function saveProduct(productId: string) {
    const cfg = configs[productId]
    startTransition(async () => {
      try {
        const res = await fetch(`/api/store/products/${productId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rewards_enabled:       cfg.rewards_enabled,
            rewards_points_earned: cfg.rewards_points_earned,
            rewards_multiplier:    cfg.rewards_multiplier,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setSavedIds((prev) => new Set([...prev, productId]))
        setTimeout(() => setSavedIds((prev) => { const next = new Set(prev); next.delete(productId); return next }), 2500)
      } catch (err) {
        setErrors((prev) => ({ ...prev, [productId]: err instanceof Error ? err.message : 'Save failed' }))
      }
    })
  }

  if (products.length === 0) {
    return (
      <div className="premium-panel premium-border rounded-2xl p-10 text-center">
        <Package className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-sm text-white/40">No store products found.</p>
        <p className="text-xs text-white/30 mt-1">Add products to your store to configure rewards.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-white/6 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
          <Package className="h-4 w-4 text-orange-400" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Product Rewards Config</h2>
          <p className="text-xs text-white/40">Set custom points and multipliers per product</p>
        </div>
      </div>

      <div className="divide-y divide-white/4">
        {products.map((product) => {
          const cfg     = configs[product.id]
          const isSaved = savedIds.has(product.id)
          const err     = errors[product.id]

          return (
            <div key={product.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-medium text-white truncate">{product.name}</p>
                    <span className="text-xs text-white/30">${Number(product.price).toFixed(2)}</span>
                    <label className="ml-auto flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                      <div
                        onClick={() => updateConfig(product.id, 'rewards_enabled', !cfg.rewards_enabled)}
                        className={`relative h-4 w-7 rounded-full transition-colors cursor-pointer ${cfg.rewards_enabled ? 'bg-amber-400' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${cfg.rewards_enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs text-white/40">{cfg.rewards_enabled ? 'Earns points' : 'No rewards'}</span>
                    </label>
                  </div>

                  {cfg.rewards_enabled && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-white/40 block mb-1">Custom Points / Unit</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="Use default"
                          value={cfg.rewards_points_earned ?? ''}
                          onChange={(e) => updateConfig(product.id, 'rewards_points_earned', e.target.value === '' ? null : Number(e.target.value))}
                          className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/40 block mb-1">Multiplier</label>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={cfg.rewards_multiplier}
                          onChange={(e) => updateConfig(product.id, 'rewards_multiplier', Number(e.target.value))}
                          className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => saveProduct(product.id)}
                          disabled={isPending}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${isSaved ? 'bg-emerald-400/20 border border-emerald-400/30 text-emerald-400' : 'bg-gold-gradient text-graphite-900 hover:opacity-90'} disabled:opacity-50`}
                        >
                          {isSaved ? <><Check className="h-3 w-3" />Saved</> : <><Save className="h-3 w-3" />Save</>}
                        </button>
                      </div>
                    </div>
                  )}

                  {err && <p className="text-xs text-red-400 mt-1.5">{err}</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
