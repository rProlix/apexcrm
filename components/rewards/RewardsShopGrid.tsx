'use client'
// components/rewards/RewardsShopGrid.tsx
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Gift, ShoppingBag, Edit2, Trash2, Package } from 'lucide-react'
import type { RewardShopItem } from '@/types/rewards'
import { RewardsShopItemForm } from './RewardsShopItemForm'

interface Props {
  items:       RewardShopItem[]
  isAdmin?:    boolean
  userPoints?: number
  tenantId?:   string
  onRedeem?:   (itemId: string) => Promise<void>
}

function redemptionBadge(item: RewardShopItem): string {
  switch (item.redemption_type) {
    case 'free_item': return 'Free Item'
    case 'discount':
      if (item.discount_type === 'percent') return `${item.discount_value ?? 0}% Off`
      return `$${item.discount_value ?? 0} Off`
    case 'custom': return 'Custom Reward'
    default: return 'Points Reward'
  }
}

export function RewardsShopGrid({ items, isAdmin, userPoints = 0, tenantId, onRedeem }: Props) {
  const [, startTransition] = useTransition()
  const [editItem, setEditItem]     = useState<RewardShopItem | null>(null)
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [redeemError, setRedeemError] = useState<Record<string, string>>({})
  const [redeemSuccess, setRedeemSuccess] = useState<Set<string>>(new Set())

  async function handleRedeem(item: RewardShopItem) {
    if (!onRedeem) return
    setRedeemingId(item.id)
    setRedeemError((prev) => ({ ...prev, [item.id]: '' }))
    try {
      await onRedeem(item.id)
      setRedeemSuccess((prev) => new Set([...prev, item.id]))
    } catch (err) {
      setRedeemError((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'Redemption failed' }))
    } finally {
      setRedeemingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this shop item?')) return
    startTransition(async () => {
      await fetch(`/api/rewards/shop-items/${id}`, { method: 'DELETE' })
      window.location.reload()
    })
  }

  if (items.length === 0) {
    return (
      <div className="premium-panel premium-border rounded-2xl p-12 text-center">
        <div className="h-14 w-14 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center mx-auto mb-4">
          <Gift className="h-7 w-7 text-gold-400/50" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">No items available</h3>
        <p className="text-xs text-white/40">
          {isAdmin ? 'Create your first rewards shop item above.' : 'Check back soon for rewards to redeem.'}
        </p>
      </div>
    )
  }

  return (
    <>
      {editItem && (
        <div className="mb-6">
          <RewardsShopItemForm
            tenantId={tenantId ?? ''}
            products={[]}
            editItem={editItem}
            onClose={() => setEditItem(null)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item, i) => {
          const canAfford    = userPoints >= item.points_cost
          const isRedeeming  = redeemingId === item.id
          const didRedeem    = redeemSuccess.has(item.id)
          const itemError    = redeemError[item.id]
          const outOfStock   = item.inventory_count <= 0 && item.inventory_count !== 0

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`premium-panel premium-border rounded-2xl overflow-hidden ${!item.is_active ? 'opacity-50' : ''}`}
            >
              {/* Header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="h-11 w-11 rounded-xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center flex-shrink-0">
                    {item.product_id
                      ? <Package className="h-5.5 w-5.5 text-gold-400" strokeWidth={1.75} />
                      : <Gift className="h-5.5 w-5.5 text-gold-400" strokeWidth={1.75} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-white/40 mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditItem(item)} className="h-7 w-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                        <Edit2 className="h-3.5 w-3.5 text-white/60" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-gold-400/10 border border-gold-400/20 text-gold-400">
                    {redemptionBadge(item)}
                  </span>
                  {item.product_id && (
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-orange-400/10 border border-orange-400/20 text-orange-400">
                      Store Product
                    </span>
                  )}
                  {outOfStock && (
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-white/4 border border-white/8 text-white/30">
                      Out of Stock
                    </span>
                  )}
                  {!item.is_active && isAdmin && (
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-white/4 border border-white/8 text-white/30">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Points cost + action */}
                <div className="flex items-center justify-between pt-3 border-t border-white/6">
                  <div>
                    <p className="text-lg font-bold text-amber-400 tabular-nums">{item.points_cost.toLocaleString()}</p>
                    <p className="text-xs text-white/30">points</p>
                  </div>
                  {!isAdmin && onRedeem && (
                    <button
                      onClick={() => handleRedeem(item)}
                      disabled={!canAfford || outOfStock || isRedeeming || didRedeem}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-all ${
                        didRedeem
                          ? 'bg-emerald-400/20 border border-emerald-400/30 text-emerald-400'
                          : canAfford && !outOfStock
                            ? 'bg-gold-gradient text-graphite-900 hover:opacity-90'
                            : 'bg-white/6 border border-white/10 text-white/30 cursor-not-allowed'
                      }`}
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {didRedeem ? 'Redeemed!' : isRedeeming ? 'Redeeming…' : !canAfford ? `Need ${(item.points_cost - userPoints).toLocaleString()} more` : 'Redeem'}
                    </button>
                  )}
                  {isAdmin && (
                    <div className="text-right">
                      <p className="text-xs text-white/40">
                        {item.inventory_count === 0 ? 'Unlimited' : `${item.inventory_count} left`}
                      </p>
                      {item.max_redemptions_per_customer && (
                        <p className="text-xs text-white/30">Max {item.max_redemptions_per_customer}/customer</p>
                      )}
                    </div>
                  )}
                </div>
                {itemError && <p className="text-xs text-red-400 mt-2">{itemError}</p>}
              </div>
            </motion.div>
          )
        })}
      </div>
    </>
  )
}
