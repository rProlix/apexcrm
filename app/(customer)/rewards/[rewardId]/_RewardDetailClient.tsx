'use client'
// app/(customer)/rewards/[rewardId]/_RewardDetailClient.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gift, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  itemId:         string
  canAfford:      boolean
  outOfStock:     boolean
  currentBalance: number
}

export function RewardsRedemptionCard({ itemId, canAfford, outOfStock, currentBalance }: Props) {
  const router  = useRouter()
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')
  const [newBalance, setNewBalance] = useState(currentBalance)

  async function handleRedeem() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/rewards/redemptions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ item_id: itemId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewBalance(data.new_balance ?? currentBalance)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redemption failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-4"
      >
        <div className="h-12 w-12 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" strokeWidth={1.75} />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">Redeemed!</h3>
        <p className="text-xs text-white/40 mb-1">Your redemption is pending approval.</p>
        <p className="text-xs text-emerald-400 font-semibold">New balance: {newBalance.toLocaleString()} pts</p>
        <button
          onClick={() => router.push('/rewards/history')}
          className="mt-4 text-xs text-gold-400 hover:text-gold-300 transition-colors"
        >
          View history →
        </button>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
      <button
        onClick={handleRedeem}
        disabled={!canAfford || outOfStock || loading}
        className="w-full flex items-center justify-center gap-2 bg-gold-gradient text-graphite-900 font-bold text-sm py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Gift className="h-4 w-4" />
        {loading ? 'Processing…' : 'Redeem Now'}
      </button>
    </div>
  )
}
