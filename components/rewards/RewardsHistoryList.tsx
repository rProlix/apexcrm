'use client'
// components/rewards/RewardsHistoryList.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Gift, Filter } from 'lucide-react'

interface TxRow {
  id:               string
  customer_id:      string
  transaction_type: string
  points_delta:     number
  source_type:      string | null
  created_at:       string
  customers?: { name: string; email: string } | null
}

interface RedemptionRow {
  id:          string
  customer_id: string
  points_used: number
  status:      string
  created_at:  string
  reward_shop_items?: { name: string } | null
  customers?:         { name: string; email: string } | null
}

interface Props {
  transactions: TxRow[]
  redemptions:  RedemptionRow[]
}

type Tab = 'transactions' | 'redemptions'

const TX_TYPE_STYLES: Record<string, string> = {
  earned:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  redeemed: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  adjusted: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  bonus:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  expired:  'text-white/30 bg-white/4 border-white/8',
}
const REDEMPTION_STATUS_STYLES: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  approved:  'text-blue-400 bg-blue-400/10 border-blue-400/20',
  fulfilled: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  canceled:  'text-white/30 bg-white/4 border-white/8',
}

export function RewardsHistoryList({ transactions, redemptions }: Props) {
  const [tab, setTab] = useState<Tab>('transactions')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-orange-400" strokeWidth={1.75} />
          </div>
          <h2 className="text-sm font-semibold text-white">Activity Log</h2>
        </div>
        <div className="flex items-center gap-1 bg-white/4 rounded-xl p-1">
          {(['transactions', 'redemptions'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
            >
              {t === 'transactions' ? `Transactions (${transactions.length})` : `Redemptions (${redemptions.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'transactions' && (
        <div className="divide-y divide-white/4">
          {transactions.length === 0 && (
            <div className="py-16 text-center">
              <Filter className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-white/40">No transactions yet.</p>
            </div>
          )}
          {transactions.map((tx) => (
            <div key={tx.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md border flex-shrink-0 ${TX_TYPE_STYLES[tx.transaction_type] ?? 'text-white/60 bg-white/4 border-white/8'}`}>
                  {tx.transaction_type}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{tx.customers?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-white/30">{tx.source_type ?? '—'} · {new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${tx.points_delta > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                {tx.points_delta > 0 ? '+' : ''}{tx.points_delta.toLocaleString()} pts
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'redemptions' && (
        <div className="divide-y divide-white/4">
          {redemptions.length === 0 && (
            <div className="py-16 text-center">
              <Gift className="h-8 w-8 text-white/20 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-white/40">No redemptions yet.</p>
            </div>
          )}
          {redemptions.map((r) => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md border flex-shrink-0 ${REDEMPTION_STATUS_STYLES[r.status] ?? 'text-white/60 bg-white/4 border-white/8'}`}>
                  {r.status}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{r.customers?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-white/30">{r.reward_shop_items?.name ?? 'Unknown item'} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums text-orange-400 flex-shrink-0">
                -{r.points_used.toLocaleString()} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
