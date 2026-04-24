// app/(customer)/rewards/history/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { TrendingUp, Gift, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Rewards History' }

const TX_COLORS: Record<string, string> = {
  earned:   'text-emerald-400',
  redeemed: 'text-orange-400',
  adjusted: 'text-blue-400',
  bonus:    'text-yellow-400',
  expired:  'text-white/30',
}

const REDEMPTION_STATUS_COLORS: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  approved:  'text-blue-400 bg-blue-400/10 border-blue-400/20',
  fulfilled: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  canceled:  'text-white/30 bg-white/4 border-white/8',
}

export default async function CustomerRewardsHistoryPage() {
  const host = headers().get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const supabase = getSupabaseServerClient()

  const [txnRes, redemptionsRes] = await Promise.all([
    supabase
      .from('rewards_transactions')
      .select('id, transaction_type, points_delta, source_type, created_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', ctx.customer_id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('reward_redemptions')
      .select('id, points_used, status, created_at, reward_shop_items(name)')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', ctx.customer_id)
      .order('created_at', { ascending: false }),
  ])

  const transactions = txnRes.data ?? []
  const redemptions  = redemptionsRes.data ?? []

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/rewards" className="h-8 w-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-4 w-4 text-white/60" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Rewards History</h1>
          <p className="text-sm text-white/40">All your points activity and redemptions</p>
        </div>
      </div>

      {/* Transactions */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
          Points Activity ({transactions.length})
        </h2>

        {transactions.length === 0 ? (
          <div className="premium-panel premium-border rounded-2xl p-10 text-center">
            <p className="text-sm text-white/40">No points activity yet.</p>
          </div>
        ) : (
          <div className="premium-panel premium-border rounded-2xl divide-y divide-white/4">
            {transactions.map((tx) => (
              <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white capitalize">{tx.transaction_type}</p>
                  <p className="text-xs text-white/30">
                    {tx.source_type ?? 'n/a'} · {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${TX_COLORS[tx.transaction_type] ?? 'text-white/60'}`}>
                  {tx.points_delta > 0 ? '+' : ''}{tx.points_delta.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Redemptions */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Gift className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
          Redemptions ({redemptions.length})
        </h2>

        {redemptions.length === 0 ? (
          <div className="premium-panel premium-border rounded-2xl p-10 text-center">
            <p className="text-sm text-white/40">No redemptions yet.</p>
            <Link href="/rewards/shop" className="text-xs text-gold-400 hover:text-gold-300 transition-colors mt-2 block">
              Browse the Rewards Shop →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {redemptions.map((r) => {
              const item = r.reward_shop_items as { name: string } | null
              return (
                <div key={r.id} className="premium-panel premium-border rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center flex-shrink-0">
                      <Gift className="h-4.5 w-4.5 text-gold-400" strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{item?.name ?? 'Unknown reward'}</p>
                      <p className="text-xs text-white/30">
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-lg border ${REDEMPTION_STATUS_COLORS[r.status] ?? REDEMPTION_STATUS_COLORS.pending}`}>
                      {r.status}
                    </span>
                    <span className="text-sm font-bold text-orange-400 tabular-nums">
                      -{r.points_used.toLocaleString()} pts
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
