'use client'
// components/rewards/RewardsRedemptionCard.tsx
import { motion } from 'framer-motion'
import { Gift, Clock, CheckCircle2, XCircle } from 'lucide-react'
import type { RewardRedemption } from '@/types/rewards'

interface Props {
  redemption: RewardRedemption
  isAdmin?:   boolean
  onUpdateStatus?: (id: string, status: string) => Promise<void>
}

const STATUS_CONFIG = {
  pending: {
    icon:   Clock,
    color:  'text-yellow-400',
    bg:     'bg-yellow-400/10',
    border: 'border-yellow-400/20',
    label:  'Pending',
  },
  approved: {
    icon:   CheckCircle2,
    color:  'text-blue-400',
    bg:     'bg-blue-400/10',
    border: 'border-blue-400/20',
    label:  'Approved',
  },
  fulfilled: {
    icon:   CheckCircle2,
    color:  'text-emerald-400',
    bg:     'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    label:  'Fulfilled',
  },
  canceled: {
    icon:   XCircle,
    color:  'text-white/30',
    bg:     'bg-white/4',
    border: 'border-white/8',
    label:  'Canceled',
  },
}

export function RewardsRedemptionCard({ redemption, isAdmin, onUpdateStatus }: Props) {
  const cfg       = STATUS_CONFIG[redemption.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
  const StatusIcon = cfg.icon
  const itemName  = (redemption.reward_shop_items as { name: string } | null)?.name

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`premium-panel premium-border rounded-2xl p-4 border ${cfg.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center flex-shrink-0`}>
            <Gift className={`h-4.5 w-4.5 ${cfg.color}`} strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{itemName ?? 'Unknown reward'}</p>
            <p className="text-xs text-white/40">
              {new Date(redemption.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
            <StatusIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {cfg.label}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-base font-bold text-orange-400 tabular-nums">
          -{redemption.points_used.toLocaleString()} pts
        </span>

        {isAdmin && onUpdateStatus && redemption.status !== 'canceled' && redemption.status !== 'fulfilled' && (
          <div className="flex gap-2">
            {redemption.status === 'pending' && (
              <button
                onClick={() => onUpdateStatus(redemption.id, 'approved')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-400/10 border border-blue-400/20 text-blue-400 hover:bg-blue-400/20 transition-colors"
              >
                Approve
              </button>
            )}
            {(redemption.status === 'pending' || redemption.status === 'approved') && (
              <button
                onClick={() => onUpdateStatus(redemption.id, 'fulfilled')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/20 transition-colors"
              >
                Mark Fulfilled
              </button>
            )}
            <button
              onClick={() => onUpdateStatus(redemption.id, 'canceled')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
