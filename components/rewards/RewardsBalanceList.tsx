'use client'
// components/rewards/RewardsBalanceList.tsx
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Users, Search, TrendingUp, Edit2, X } from 'lucide-react'

interface BalanceRow {
  id:                       string
  customer_id:              string
  points_balance:           number
  lifetime_points_earned:   number
  lifetime_points_redeemed: number
  updated_at:               string
  customers?: { name: string; email: string } | null
}

interface Props {
  balances: BalanceRow[]
}

export function RewardsBalanceList({ balances }: Props) {
  const [query, setQuery]           = useState('')
  const [adjustId, setAdjustId]     = useState<string | null>(null)
  const [delta, setDelta]           = useState<number>(0)
  const [reason, setReason]         = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError]           = useState('')

  const filtered = balances.filter((b) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      b.customers?.name?.toLowerCase().includes(q) ||
      b.customers?.email?.toLowerCase().includes(q)
    )
  })

  async function handleAdjust(customerId: string) {
    if (!delta) { setError('Enter a points delta'); return }
    setError('')
    startTransition(async () => {
      try {
        const res = await fetch(`/api/rewards/balances/${customerId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ points_delta: delta, reason }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setAdjustId(null); setDelta(0); setReason('')
        window.location.reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Adjustment failed')
      }
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
            <Users className="h-4 w-4 text-yellow-400" strokeWidth={1.75} />
          </div>
          <h2 className="text-sm font-semibold text-white">Customer Balances ({balances.length})</h2>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers…"
            className="store-input w-full rounded-xl pl-8 pr-3 py-1.5 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <TrendingUp className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-sm text-white/40">No balances found.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/4">
          {filtered.map((row) => (
            <div key={row.id}>
              <div className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{row.customers?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-white/40">{row.customers?.email ?? '—'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-base font-bold text-amber-400 tabular-nums">{row.points_balance.toLocaleString()}</p>
                    <p className="text-xs text-white/30">pts balance</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-white/50 tabular-nums">{row.lifetime_points_earned.toLocaleString()}</p>
                    <p className="text-xs text-white/30">earned</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-white/50 tabular-nums">{row.lifetime_points_redeemed.toLocaleString()}</p>
                    <p className="text-xs text-white/30">redeemed</p>
                  </div>
                  <button
                    onClick={() => setAdjustId(adjustId === row.customer_id ? null : row.customer_id)}
                    className="h-7 w-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    {adjustId === row.customer_id ? <X className="h-3.5 w-3.5 text-white/60" /> : <Edit2 className="h-3.5 w-3.5 text-white/60" />}
                  </button>
                </div>
              </div>

              {adjustId === row.customer_id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="px-5 pb-4 bg-white/2"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <label className="text-xs text-white/40 block mb-1">Points Delta (+ or -)</label>
                      <input
                        type="number"
                        value={delta || ''}
                        onChange={(e) => setDelta(Number(e.target.value))}
                        placeholder="+100 or -50"
                        className="store-input rounded-lg px-3 py-1.5 text-xs w-28"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-white/40 block mb-1">Reason</label>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional reason"
                        className="store-input rounded-lg px-3 py-1.5 text-xs w-full"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => handleAdjust(row.customer_id)}
                        disabled={isPending}
                        className="bg-gold-gradient text-graphite-900 font-semibold text-xs px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {isPending ? 'Saving…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                  {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
