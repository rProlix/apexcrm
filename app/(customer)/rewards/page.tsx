// app/(customer)/rewards/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerRewardsBalanceSafe } from '@/lib/rewards/getCustomerRewardsBalance'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { estimatePointsForAmount } from '@/lib/rewards/calculatePoints'
import { getActivePunchCards } from '@/lib/rewards/getPunchCardProgress'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Star, Gift, Zap, TrendingUp, ShoppingBag } from 'lucide-react'

export const metadata = { title: 'My Rewards' }

export default async function CustomerRewardsPage() {
  const host    = headers().get('host') ?? ''
  const ctx     = await requireCustomerAuth(host)

  const [balance, program, punchCards, recentTxRes] = await Promise.all([
    getCustomerRewardsBalanceSafe(ctx.tenant_id, ctx.customer_id),
    getRewardsProgram(ctx.tenant_id),
    getActivePunchCards(ctx.tenant_id, ctx.customer_id),
    getSupabaseServerClient()
      .from('rewards_transactions')
      .select('points_delta, transaction_type, source_type, created_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', ctx.customer_id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const recentTxns = recentTxRes.data ?? []
  const pointsPerDollar = program?.earning_rules.points_per_dollar ?? 10
  const estimateFor10 = estimatePointsForAmount(10, program?.earning_rules ?? {})

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
          <Star className="h-6 w-6 text-amber-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Your Rewards</h1>
          <p className="text-sm text-white/40">{program?.name ?? 'Loyalty Program'}</p>
        </div>
      </div>

      {/* Balance hero */}
      <div className="premium-panel rounded-2xl p-8 border border-amber-400/20 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-400/4 to-transparent pointer-events-none" />
        <p className="text-xs font-semibold text-amber-400/60 uppercase tracking-widest mb-3">Points Balance</p>
        <p className="text-6xl font-black text-amber-400 tabular-nums leading-none">
          {balance.points_balance.toLocaleString()}
        </p>
        <p className="text-sm text-white/40 mt-2">points available to redeem</p>

        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-white/8">
          <div>
            <p className="text-xl font-bold text-white tabular-nums">{balance.lifetime_points_earned.toLocaleString()}</p>
            <p className="text-xs text-white/40">Total earned</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white tabular-nums">{balance.lifetime_points_redeemed.toLocaleString()}</p>
            <p className="text-xs text-white/40">Total redeemed</p>
          </div>
        </div>
      </div>

      {/* Earning info */}
      <div className="premium-panel premium-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
          How You Earn
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">Every $1 spent</span>
            <span className="text-amber-400 font-semibold">{pointsPerDollar} points</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">$10 purchase earns</span>
            <span className="text-amber-400 font-semibold">{estimateFor10} points</span>
          </div>
          {(program?.earning_rules.bonus_points_products?.length ?? 0) > 0 && (
            <p className="text-xs text-white/30 mt-2">
              Some products earn bonus points. Look for the ⭐ badge in the store.
            </p>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/rewards/shop',        icon: Gift,        label: 'Rewards Shop',  color: 'text-gold-400',   bg: 'bg-gold-400/10',   border: 'border-gold-400/20' },
          { href: '/rewards/punch-cards', icon: Zap,         label: 'Punch Cards',   color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20' },
          { href: '/rewards/history',     icon: TrendingUp,  label: 'History',       color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
          { href: '/store',               icon: ShoppingBag, label: 'Shop & Earn',   color: 'text-emerald-400',bg: 'bg-emerald-400/10',border: 'border-emerald-400/20' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`group premium-panel premium-border rounded-xl p-4 flex flex-col items-center gap-2 hover:border-${link.color.replace('text-', '')}/40 transition-all text-center`}
          >
            <div className={`h-9 w-9 rounded-xl ${link.bg} border ${link.border} flex items-center justify-center`}>
              <link.icon className={`h-4.5 w-4.5 ${link.color}`} strokeWidth={1.75} />
            </div>
            <span className="text-xs font-medium text-white/70 group-hover:text-white transition-colors">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Active punch cards preview */}
      {punchCards.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
              Active Punch Cards
            </h2>
            <Link href="/rewards/punch-cards" className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {punchCards.slice(0, 2).map((card) => (
              <div key={card.id} className="premium-panel premium-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-white">{card.title}</p>
                  <p className="text-xs text-amber-400 font-semibold tabular-nums">{card.current_punches}/{card.punch_goal}</p>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gold-gradient transition-all duration-700"
                    style={{ width: `${Math.min(100, (card.current_punches / card.punch_goal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {recentTxns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link href="/rewards/history" className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
              View all
            </Link>
          </div>
          <div className="premium-panel premium-border rounded-2xl divide-y divide-white/4">
            {recentTxns.map((tx, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-white capitalize">{tx.transaction_type}</p>
                  <p className="text-xs text-white/30">{tx.source_type ?? '—'} · {new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${tx.points_delta > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {tx.points_delta > 0 ? '+' : ''}{tx.points_delta.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {balance.lifetime_points_earned === 0 && (
        <div className="premium-panel premium-border rounded-2xl p-10 text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="h-7 w-7 text-amber-400/50" strokeWidth={1.5} />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">Start Earning Points</h3>
          <p className="text-xs text-white/40 mb-5">
            Make a purchase in our store to start earning rewards points.
          </p>
          <Link href="/store" className="inline-flex items-center gap-2 bg-gold-gradient text-graphite-900 font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
            <ShoppingBag className="h-4 w-4" />
            Go to Store
          </Link>
        </div>
      )}
    </div>
  )
}
