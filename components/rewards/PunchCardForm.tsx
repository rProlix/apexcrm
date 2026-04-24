'use client'
// components/rewards/PunchCardForm.tsx
import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Plus, Save, Trash2, Check, AlertCircle, Package, Loader2 } from 'lucide-react'
import type { RewardsProgram, PunchCardRule, PunchCardRewardType } from '@/types/rewards'

interface StoreProduct {
  id:   string
  name: string
  price: number
  currency: string
}

interface Props {
  tenantId: string
  program:  RewardsProgram | null
  // products prop kept for compatibility but products are fetched live from /api/store/products
  products?: unknown[]
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

const REWARD_TYPE_LABELS: Record<PunchCardRewardType, string> = {
  free_item:    'Free Item',
  percent_off:  'Percentage Off',
  fixed_off:    'Fixed Amount Off',
  bonus_points: 'Bonus Points',
}

export function PunchCardForm({ program }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  // ── Fetch store products from the existing /api/store/products endpoint ──
  const [products, setProducts]         = useState<StoreProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError]     = useState('')

  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true)
      setProductsError('')
      try {
        const res = await fetch('/api/store/products')
        if (!res.ok) throw new Error(`Failed to load products (${res.status})`)
        const data = await res.json()
        setProducts(data.products ?? [])
      } catch (err) {
        setProductsError(err instanceof Error ? err.message : 'Could not load store products')
      } finally {
        setProductsLoading(false)
      }
    }
    loadProducts()
  }, [])

  // ── Punch card rules state ───────────────────────────────────────────────
  const [rules, setRules] = useState<PunchCardRule[]>(
    (program?.punch_card_rules ?? []).map((r) => ({ ...r }))
  )

  function addRule() {
    setSaved(false)
    setRules((prev) => [
      ...prev,
      {
        id:           generateId(),
        name:         '',
        product_id:   null,
        punch_goal:   10,
        reward_type:  'free_item',
        reward_value: null,
        enabled:      true,
      },
    ])
  }

  function removeRule(id: string) {
    setSaved(false)
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  function updateRule(id: string, key: keyof PunchCardRule, value: unknown) {
    setSaved(false)
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, [key]: value } : r))
  }

  async function handleSave() {
    for (const rule of rules) {
      if (!rule.name.trim()) { setError('Each punch card must have a name'); return }
      if (rule.punch_goal < 1) { setError('Punch goal must be at least 1'); return }
      if (rule.reward_type !== 'free_item' && (rule.reward_value == null || rule.reward_value <= 0)) {
        setError(`"${rule.name || 'Punch card'}" needs a reward value greater than 0`); return
      }
    }
    setError('')

    const updatedRules = rules.map((r) => ({
      ...r,
      name:         r.name.trim(),
      product_name: products.find((p) => p.id === r.product_id)?.name ?? null,
    }))

    startTransition(async () => {
      try {
        let res: Response

        if (program) {
          res = await fetch(`/api/rewards/programs/${program.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ punch_card_rules: updatedRules }),
          })
        } else {
          res = await fetch('/api/rewards/programs', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              name:             'Default Rewards Program',
              description:      'Auto-created when punch cards were configured.',
              punch_card_rules: updatedRules,
              settings: {
                points_enabled:        true,
                punch_cards_enabled:   true,
                shop_enabled:          true,
                min_redemption_points: 100,
              },
            }),
          })
        }

        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Save failed')

        setSaved(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed. Please try again.')
      }
    })
  }

  // ── Product selector sub-component ───────────────────────────────────────
  function ProductSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
    if (productsLoading) {
      return (
        <div className="store-input w-full rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 text-white/30">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading products…
        </div>
      )
    }

    if (productsError) {
      return (
        <div className="store-input w-full rounded-lg px-3 py-1.5 text-xs text-red-400">
          {productsError}
        </div>
      )
    }

    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
      >
        <option value="">Any product / order</option>
        {products.length === 0 ? (
          <option disabled value="">— No store products found —</option>
        ) : (
          products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.currency ?? 'USD'} {Number(p.price).toFixed(2)})
            </option>
          ))
        )}
      </select>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Configure Punch Cards</h2>
            <p className="text-xs text-white/40">
              {program
                ? `Saved to: ${program.name}`
                : 'No rewards program yet — saving will create one automatically'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Product count badge */}
          {!productsLoading && (
            <div className="flex items-center gap-1.5 text-xs text-white/30">
              <Package className="h-3.5 w-3.5" />
              {products.length} product{products.length !== 1 ? 's' : ''} available
            </div>
          )}
          <button
            type="button"
            onClick={addRule}
            className="flex items-center gap-1.5 text-xs font-medium text-gold-400 hover:text-gold-300 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add card
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Products unavailable warning */}
        {!productsLoading && products.length === 0 && !productsError && (
          <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-400/8 border border-amber-400/20 rounded-xl px-4 py-3">
            <Package className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              No products found in your store. You can still create punch cards for{' '}
              <em>any product / order</em>, or{' '}
              <a href="/store/products" className="underline hover:text-amber-300 transition-colors">
                add products to your store
              </a>{' '}
              first to enable product-specific punch cards.
            </span>
          </div>
        )}

        {/* Empty state */}
        {rules.length === 0 && (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
            <Zap className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-white/40 mb-1">No punch cards configured</p>
            <p className="text-xs text-white/25">
              Click <span className="text-gold-400">Add card</span> above to create your first punch card.
            </p>
          </div>
        )}

        {/* Rule editor cards */}
        <AnimatePresence initial={false}>
          {rules.map((rule) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-white/4 rounded-xl border border-white/8 p-4 space-y-3"
            >
              {/* Rule header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
                  <span className="text-xs font-medium text-white/70">Punch Card Rule</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Enable toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <div
                      onClick={() => updateRule(rule.id, 'enabled', !rule.enabled)}
                      className={`relative h-4 w-7 rounded-full transition-colors cursor-pointer ${rule.enabled ? 'bg-gold-400' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${rule.enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs text-white/40">{rule.enabled ? 'Active' : 'Disabled'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    className="h-6 w-6 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                    title="Remove this punch card"
                  >
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Name + product selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Card Name *</label>
                  <input
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, 'name', e.target.value)}
                    placeholder="e.g. Coffee Punch Card"
                    className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1 flex items-center gap-1.5">
                    <Package className="h-3 w-3" />
                    Qualifying Product
                    {productsLoading && <Loader2 className="h-3 w-3 animate-spin text-white/30" />}
                  </label>
                  <ProductSelect
                    value={rule.product_id}
                    onChange={(v) => updateRule(rule.id, 'product_id', v)}
                  />
                </div>
              </div>

              {/* Goal + reward type + reward value */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Purchases Required *</label>
                  <input
                    type="number"
                    min={1}
                    value={rule.punch_goal}
                    onChange={(e) => updateRule(rule.id, 'punch_goal', Math.max(1, Number(e.target.value)))}
                    className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Reward Type</label>
                  <select
                    value={rule.reward_type}
                    onChange={(e) => updateRule(rule.id, 'reward_type', e.target.value)}
                    className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
                  >
                    {(Object.entries(REWARD_TYPE_LABELS) as [PunchCardRewardType, string][]).map(([val, lbl]) => (
                      <option key={val} value={val}>{lbl}</option>
                    ))}
                  </select>
                </div>
                {rule.reward_type !== 'free_item' && (
                  <div>
                    <label className="text-xs text-white/40 block mb-1">
                      {rule.reward_type === 'percent_off'  ? 'Percentage (%)'  :
                       rule.reward_type === 'fixed_off'    ? 'Amount Off ($)'  :
                       rule.reward_type === 'bonus_points' ? 'Bonus Points'    : 'Value'}
                    </label>
                    <input
                      type="number"
                      min={0.01}
                      step={rule.reward_type === 'bonus_points' ? 1 : 0.01}
                      value={rule.reward_value ?? ''}
                      onChange={(e) => updateRule(rule.id, 'reward_value', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="e.g. 50"
                      className="store-input w-full rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Human-readable summary */}
              <div className="text-xs text-white/30 px-3 py-2 bg-white/3 rounded-lg leading-relaxed">
                <span className="text-white/50 font-medium">Preview: </span>
                Buy{' '}
                <strong className="text-white/70">{rule.punch_goal}</strong>{' '}
                {rule.product_id
                  ? <strong className="text-amber-400/80">{products.find((p) => p.id === rule.product_id)?.name ?? 'selected product'}</strong>
                  : 'of any item'
                },{' '}
                get{' '}
                {rule.reward_type === 'free_item'    ? 'the next one free' :
                 rule.reward_type === 'percent_off'  ? <><strong className="text-emerald-400/80">{rule.reward_value ?? '?'}%</strong> off the next</> :
                 rule.reward_type === 'fixed_off'    ? <><strong className="text-emerald-400/80">${rule.reward_value ?? '?'}</strong> off the next</> :
                 <>a <strong className="text-emerald-400/80">{rule.reward_value ?? '?'} bonus points</strong> reward</>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-4 py-3">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
            {error}
          </div>
        )}

        {/* Save footer */}
        <div className="flex items-center gap-3 pt-2 border-t border-white/6">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 bg-gold-gradient text-graphite-900 font-semibold text-sm px-5 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saved
              ? <><Check className="h-4 w-4" />Saved</>
              : isPending
              ? <><Save className="h-4 w-4 animate-pulse" />Saving…</>
              : <><Save className="h-4 w-4" />{rules.length === 0 ? 'Save (clears all)' : `Save ${rules.length} card${rules.length !== 1 ? 's' : ''}`}</>
            }
          </button>
          {saved && !isPending && (
            <span className="text-xs text-emerald-400">
              Saved. Rules are now active for new customer purchases.
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
