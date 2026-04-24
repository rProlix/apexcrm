'use client'
// components/rewards/RewardsProgramForm.tsx
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Star, Plus, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import type { RewardsProgram, ProductWithRewards } from '@/types/rewards'

interface Props {
  tenantId: string
  programs: RewardsProgram[]
  products: ProductWithRewards[]
}

const STATUS_LABELS: Record<string, string> = {
  active:   'Active',
  paused:   'Paused',
  archived: 'Archived',
}
const STATUS_COLORS: Record<string, string> = {
  active:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  paused:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  archived: 'text-white/30 bg-white/4 border-white/8',
}

export function RewardsProgramForm({ programs, products }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm]     = useState(programs.length === 0)
  const [editId, setEditId]         = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError]           = useState('')

  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus]         = useState<'active' | 'paused' | 'archived'>('active')
  const [pointsPerDollar, setPointsPerDollar] = useState(10)
  const [pointsEnabled, setPointsEnabled] = useState(true)
  const [punchCardsEnabled, setPunchCardsEnabled] = useState(true)
  const [shopEnabled, setShopEnabled] = useState(true)
  const [minRedemption, setMinRedemption] = useState(100)

  function resetForm() {
    setName(''); setDescription(''); setStatus('active')
    setPointsPerDollar(10); setPointsEnabled(true)
    setPunchCardsEnabled(true); setShopEnabled(true)
    setMinRedemption(100); setEditId(null)
  }

  function populateForm(p: RewardsProgram) {
    setName(p.name); setDescription(p.description ?? '')
    setStatus(p.status); setPointsPerDollar(p.earning_rules.points_per_dollar ?? 10)
    setPointsEnabled(p.settings.points_enabled)
    setPunchCardsEnabled(p.settings.punch_cards_enabled)
    setShopEnabled(p.settings.shop_enabled)
    setMinRedemption(p.settings.min_redemption_points)
    setEditId(p.id); setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Program name is required'); return }
    setError('')

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      status,
      earning_rules: {
        points_per_dollar: pointsPerDollar,
        enabled: pointsEnabled,
        bonus_points_products: editId
          ? (programs.find((p) => p.id === editId)?.earning_rules.bonus_points_products ?? [])
          : [],
      },
      settings: {
        points_enabled:        pointsEnabled,
        punch_cards_enabled:   punchCardsEnabled,
        shop_enabled:          shopEnabled,
        min_redemption_points: minRedemption,
      },
    }

    startTransition(async () => {
      try {
        const url    = editId ? `/api/rewards/programs/${editId}` : '/api/rewards/programs'
        const method = editId ? 'PATCH' : 'POST'
        const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error((await res.json()).error)
        resetForm(); setShowForm(false)
        window.location.reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this program? This cannot be undone.')) return
    startTransition(async () => {
      await fetch(`/api/rewards/programs/${id}`, { method: 'DELETE' })
      window.location.reload()
    })
  }

  return (
    <div className="space-y-5">
      {/* Existing programs */}
      {programs.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="premium-panel premium-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                <Star className="h-4.5 w-4.5 text-yellow-400" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                {p.description && <p className="text-xs text-white/40 mt-0.5">{p.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${STATUS_COLORS[p.status]}`}>
                {STATUS_LABELS[p.status]}
              </span>
              <button
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                className="h-7 w-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                {expandedId === p.id ? <ChevronUp className="h-3.5 w-3.5 text-white/60" /> : <ChevronDown className="h-3.5 w-3.5 text-white/60" />}
              </button>
              <button onClick={() => populateForm(p)} className="h-7 w-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <Edit2 className="h-3.5 w-3.5 text-white/60" />
              </button>
              <button onClick={() => handleDelete(p.id)} className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </button>
            </div>
          </div>

          {expandedId === p.id && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="px-5 pb-4 border-t border-white/6 pt-4"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-white/40 mb-1">Points per $1</p>
                  <p className="text-white font-semibold">{p.earning_rules.points_per_dollar ?? 10}</p>
                </div>
                <div>
                  <p className="text-white/40 mb-1">Points</p>
                  <p className={p.settings.points_enabled ? 'text-emerald-400' : 'text-red-400'}>
                    {p.settings.points_enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 mb-1">Punch Cards</p>
                  <p className={p.settings.punch_cards_enabled ? 'text-emerald-400' : 'text-red-400'}>
                    {p.settings.punch_cards_enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 mb-1">Min Redemption</p>
                  <p className="text-white font-semibold">{p.settings.min_redemption_points} pts</p>
                </div>
              </div>
              {(p.earning_rules.bonus_points_products?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-white/40 mb-2">Product bonuses</p>
                  <div className="flex flex-wrap gap-2">
                    {p.earning_rules.bonus_points_products?.map((b) => {
                      const prod = products.find((pr) => pr.id === b.product_id)
                      return (
                        <span key={b.product_id} className="text-xs px-2 py-1 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-400">
                          {prod?.name ?? 'Unknown'}: {b.bonus_points} pts
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      ))}

      {/* Create / Edit form */}
      {showForm ? (
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="premium-panel premium-border rounded-2xl p-5 space-y-4 border-gold-500/20"
        >
          <h3 className="text-sm font-semibold text-white">{editId ? 'Edit Program' : 'New Program'}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Program Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold Rewards" className="store-input w-full rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="store-input w-full rounded-xl px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="store-input w-full rounded-xl px-3 py-2 text-sm resize-none" placeholder="Optional description" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Points per $1</label>
              <input type="number" min={1} value={pointsPerDollar} onChange={(e) => setPointsPerDollar(Number(e.target.value))} className="store-input w-full rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Min Redemption</label>
              <input type="number" min={0} value={minRedemption} onChange={(e) => setMinRedemption(Number(e.target.value))} className="store-input w-full rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {([['pointsEnabled', pointsEnabled, setPointsEnabled, 'Points'], ['punchCardsEnabled', punchCardsEnabled, setPunchCardsEnabled, 'Punch Cards'], ['shopEnabled', shopEnabled, setShopEnabled, 'Shop']] as const).map(([, val, set, lbl]) => (
              <label key={lbl} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => (set as (v: boolean) => void)(!val)}
                  className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${val ? 'bg-gold-400' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-white/60">{lbl}</span>
              </label>
            ))}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isPending} className="bg-gold-gradient text-graphite-900 font-semibold text-sm px-5 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
              {isPending ? 'Saving…' : editId ? 'Update' : 'Create Program'}
            </button>
            <button type="button" onClick={() => { resetForm(); setShowForm(false) }} className="text-sm text-white/40 hover:text-white/60 transition-colors px-4 py-2">
              Cancel
            </button>
          </div>
        </motion.form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 w-full premium-panel premium-border rounded-2xl p-4 text-white/40 hover:text-white/60 hover:border-gold-500/30 transition-all text-sm"
        >
          <Plus className="h-4 w-4" />
          Add rewards program
        </button>
      )}
    </div>
  )
}
