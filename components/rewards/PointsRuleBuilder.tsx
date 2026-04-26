'use client'
// components/rewards/PointsRuleBuilder.tsx
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { DollarSign, Plus, Trash2, Save } from 'lucide-react'
import type { RewardsProgram, EarningRules, ProductWithRewards } from '@/types/rewards'

interface Props {
  tenantId:  string
  program:   RewardsProgram | null
  products:  ProductWithRewards[]
}

interface BonusEntry {
  product_id:  string
  bonus_points: number
}

export function PointsRuleBuilder({ tenantId: _tenantId, program, products }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  const initialRules = program?.earning_rules ?? { points_per_dollar: 10, enabled: true, bonus_points_products: [] }

  const [pointsPerDollar, setPointsPerDollar] = useState(initialRules.points_per_dollar ?? 10)
  const [enabled, setEnabled]                 = useState(initialRules.enabled !== false)
  const [bonusEntries, setBonusEntries]        = useState<BonusEntry[]>(
    (initialRules.bonus_points_products ?? []).map((b) => ({
      product_id:  b.product_id,
      bonus_points: b.bonus_points,
    }))
  )

  function addBonusEntry() {
    setBonusEntries((prev) => [...prev, { product_id: '', bonus_points: 0 }])
  }

  function removeBonusEntry(i: number) {
    setBonusEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateBonusEntry(i: number, field: keyof BonusEntry, value: string | number) {
    setBonusEntries((prev) => prev.map((entry, idx) => idx === i ? { ...entry, [field]: value } : entry))
  }

  async function handleSave() {
    setError('')
    setSaved(false)

    const earningRules: EarningRules = {
      points_per_dollar:    pointsPerDollar,
      enabled,
      bonus_points_products: bonusEntries
        .filter((b) => b.product_id && b.bonus_points > 0)
        .map((b) => ({
          product_id:  b.product_id,
          bonus_points: b.bonus_points,
          product_name: products.find((p) => p.id === b.product_id)?.name,
        })),
    }

    startTransition(async () => {
      try {
        if (program) {
          const res = await fetch(`/api/rewards/programs/${program.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ earning_rules: earningRules }),
          })
          if (!res.ok) throw new Error((await res.json()).error)
        } else {
          const res = await fetch('/api/rewards/programs', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              name:          'Default Rewards Program',
              earning_rules: earningRules,
            }),
          })
          if (!res.ok) throw new Error((await res.json()).error)
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      }
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-white/6 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
          <DollarSign className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Points Earning Rules</h2>
          <p className="text-xs text-white/40">Configure how customers earn points</p>
        </div>
        <label className="ml-auto flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-white/50">Enabled</span>
          <div
            onClick={() => setEnabled(!enabled)}
            className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-amber-400' : 'bg-white/10'}`}
          >
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </label>
      </div>

      <div className="p-5 space-y-5">
        {/* Points per dollar */}
        <div>
          <label className="text-xs font-medium text-white/60 mb-2 block">Points per $1 spent</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={pointsPerDollar}
              onChange={(e) => setPointsPerDollar(Number(e.target.value))}
              className="store-input w-32 rounded-xl px-3 py-2 text-sm"
            />
            <span className="text-xs text-white/40">points per dollar</span>
          </div>
          <p className="text-xs text-white/30 mt-1.5">
            Example: {pointsPerDollar * 5} points earned on a $5 purchase
          </p>
        </div>

        {/* Product-specific bonuses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-medium text-white/60">Product Bonus Points</label>
            <button
              type="button"
              onClick={addBonusEntry}
              className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add product
            </button>
          </div>

          {bonusEntries.length === 0 && (
            <p className="text-xs text-white/30">No product-specific bonuses set. Add one above.</p>
          )}

          <div className="space-y-2">
            {bonusEntries.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-2"
              >
                <select
                  value={entry.product_id}
                  onChange={(e) => updateBonusEntry(i, 'product_id', e.target.value)}
                  className="store-input flex-1 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  placeholder="Points"
                  value={entry.bonus_points || ''}
                  onChange={(e) => updateBonusEntry(i, 'bonus_points', Number(e.target.value))}
                  className="store-input w-24 rounded-xl px-3 py-2 text-sm"
                />
                <span className="text-xs text-white/40 whitespace-nowrap">pts / unit</span>
                <button
                  type="button"
                  onClick={() => removeBonusEntry(i)}
                  className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Save */}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-3 pt-2 border-t border-white/6">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 bg-gold-gradient text-graphite-900 font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isPending ? 'Saving…' : 'Save Rules'}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved!</span>}
        </div>
      </div>
    </motion.div>
  )
}
