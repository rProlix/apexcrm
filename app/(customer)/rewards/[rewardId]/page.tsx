// app/(customer)/rewards/[rewardId]/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerRewardsBalanceSafe } from '@/lib/rewards/getCustomerRewardsBalance'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { RewardShopItem } from '@/types/rewards'
import { RewardsRedemptionCard as RewardDetailClient } from './_RewardDetailClient'
import { ArrowLeft, Gift, Package } from 'lucide-react'
import Link from 'next/link'

export async function generateMetadata({ params }: { params: { rewardId: string } }) {
  return { title: 'Reward Details' }
}

export default async function CustomerRewardDetailPage({ params }: { params: { rewardId: string } }) {
  const host = headers().get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const supabase = getSupabaseServerClient()

  const [itemRes, balance] = await Promise.all([
    supabase
      .from('reward_shop_items')
      .select('*, products(name, description, price, currency)')
      .eq('id', params.rewardId)
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_active', true)
      .maybeSingle(),
    getCustomerRewardsBalanceSafe(ctx.tenant_id, ctx.customer_id),
  ])

  if (!itemRes.data) notFound()

  const item = itemRes.data as RewardShopItem & { products?: { name: string; description: string | null; price: number; currency: string } | null }
  const canAfford = balance.points_balance >= item.points_cost
  const outOfStock = item.inventory_count <= 0 && item.inventory_count !== 0

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/rewards/shop" className="h-8 w-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-4 w-4 text-white/60" />
        </Link>
        <span className="text-sm text-white/40">Back to Rewards Shop</span>
      </div>

      {/* Item detail card */}
      <div className="premium-panel premium-border rounded-2xl overflow-hidden border-gold-500/20">
        <div className="p-8 text-center border-b border-white/6">
          <div className="h-16 w-16 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center mx-auto mb-5">
            {item.product_id
              ? <Package className="h-8 w-8 text-gold-400" strokeWidth={1.5} />
              : <Gift className="h-8 w-8 text-gold-400" strokeWidth={1.5} />
            }
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{item.name}</h1>
          {item.description && (
            <p className="text-sm text-white/50 leading-relaxed">{item.description}</p>
          )}
          {item.products && (
            <p className="text-xs text-white/30 mt-2">Linked to: {item.products.name}</p>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Points cost */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Points required</span>
            <span className="text-2xl font-black text-amber-400 tabular-nums">{item.points_cost.toLocaleString()}</span>
          </div>

          {/* Your balance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Your balance</span>
            <span className={`text-lg font-bold tabular-nums ${canAfford ? 'text-emerald-400' : 'text-red-400'}`}>
              {balance.points_balance.toLocaleString()} pts
            </span>
          </div>

          {canAfford && !outOfStock && (
            <div className="h-px bg-white/6" />
          )}

          {/* Redemption type info */}
          <div className="text-xs text-white/30 space-y-1">
            <div className="flex justify-between">
              <span>Redemption type</span>
              <span className="text-white/50 capitalize">{item.redemption_type.replace('_', ' ')}</span>
            </div>
            {item.redemption_type === 'discount' && item.discount_type && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span className="text-white/50">
                  {item.discount_type === 'percent' ? `${item.discount_value ?? 0}%` : `$${item.discount_value ?? 0}`} off
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Inventory</span>
              <span className={outOfStock ? 'text-red-400' : 'text-white/50'}>
                {outOfStock ? 'Out of stock' : item.inventory_count === 0 ? 'Unlimited' : `${item.inventory_count} remaining`}
              </span>
            </div>
            {item.max_redemptions_per_customer && (
              <div className="flex justify-between">
                <span>Per-customer limit</span>
                <span className="text-white/50">{item.max_redemptions_per_customer}×</span>
              </div>
            )}
          </div>

          {outOfStock && (
            <p className="text-sm text-red-400 text-center py-2">This reward is currently out of stock.</p>
          )}
          {!canAfford && !outOfStock && (
            <p className="text-sm text-white/40 text-center py-2">
              You need {(item.points_cost - balance.points_balance).toLocaleString()} more points.
            </p>
          )}

          <RewardDetailClient
            itemId={item.id}
            canAfford={canAfford}
            outOfStock={outOfStock}
            currentBalance={balance.points_balance}
          />
        </div>
      </div>
    </div>
  )
}
