// app/(customer)/rewards/shop/page.tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import { Gift, Star } from 'lucide-react'
import { RewardsShopGrid } from '@/components/rewards/RewardsShopGrid'
import type { RewardShopItem } from '@/types/rewards'

export default function CustomerRewardsShopPage() {
  const [items, setItems]       = useState<RewardShopItem[]>([])
  const [balance, setBalance]   = useState(0)
  const [loading, setLoading]   = useState(true)
  const [, startTransition]     = useTransition()

  useEffect(() => {
    async function load() {
      const [itemsRes, balRes] = await Promise.all([
        fetch('/api/rewards/shop-items'),
        fetch('/api/rewards/balances'),
      ])
      if (itemsRes.ok) {
        const d = await itemsRes.json()
        setItems(d.items ?? [])
      }
      if (balRes.ok) {
        const d = await balRes.json()
        setBalance(d.balance?.points_balance ?? 0)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleRedeem(itemId: string) {
    const res = await fetch('/api/rewards/redemptions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ item_id: itemId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setBalance(data.new_balance ?? balance)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
            <Gift className="h-6 w-6 text-gold-400" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Rewards Shop</h1>
            <p className="text-sm text-white/40">Redeem your points for exclusive rewards</p>
          </div>
        </div>
        <div className="flex items-center gap-2 premium-panel premium-border rounded-xl px-4 py-2.5 flex-shrink-0">
          <Star className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
          <span className="text-sm font-bold text-amber-400 tabular-nums">{balance.toLocaleString()}</span>
          <span className="text-xs text-white/40">pts</span>
        </div>
      </div>

      <RewardsShopGrid
        items={items}
        userPoints={balance}
        onRedeem={handleRedeem}
      />
    </div>
  )
}
