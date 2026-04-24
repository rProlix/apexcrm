'use client'
// components/rewards/PunchCardProgress.tsx
import { motion } from 'framer-motion'
import { Zap, CheckCircle2 } from 'lucide-react'
import type { RewardPunchCard } from '@/types/rewards'
import { punchCardProgressPercent, punchCardRewardLabel } from '@/lib/rewards/punchCardUtils'

interface Props {
  card:    RewardPunchCard
  isAdmin?: boolean
}

export function PunchCardProgress({ card, isAdmin }: Props) {
  const percent   = punchCardProgressPercent(card)
  const reward    = punchCardRewardLabel(card)
  const completed = card.status === 'completed'
  const productName = (card.products as { name: string } | null)?.name
  const customerName = (card as { customers?: { name: string; email: string } }).customers?.name

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`premium-panel premium-border rounded-2xl p-5 ${completed ? 'border-emerald-400/30' : 'border-gold-500/20'}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${completed ? 'bg-emerald-400/10 border-emerald-400/20' : 'bg-gold-400/10 border-gold-400/20'}`}>
            {completed
              ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" strokeWidth={1.75} />
              : <Zap className="h-4.5 w-4.5 text-gold-400" strokeWidth={1.75} />
            }
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{card.title}</p>
            {productName && <p className="text-xs text-white/40 mt-0.5">{productName}</p>}
            {isAdmin && customerName && (
              <p className="text-xs text-white/30">{customerName}</p>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-lg font-bold tabular-nums ${completed ? 'text-emerald-400' : 'text-gold-400'}`}>
            {card.current_punches}/{card.punch_goal}
          </p>
          <p className="text-xs text-white/40">punches</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 rounded-full bg-white/8 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className={`h-full rounded-full ${completed ? 'bg-emerald-400' : 'bg-gold-gradient'}`}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-white/30">{percent}% complete</span>
          {!completed && (
            <span className="text-xs text-white/40">
              {card.punch_goal - card.current_punches} more to go
            </span>
          )}
        </div>
      </div>

      {/* Punch dots (visual) */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Array.from({ length: card.punch_goal }).map((_, i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
              i < card.current_punches
                ? completed
                  ? 'bg-emerald-400 border-emerald-400'
                  : 'bg-gold-400 border-gold-400'
                : 'bg-white/4 border-white/10'
            }`}
          >
            {i < card.current_punches && (
              <CheckCircle2 className={`h-3 w-3 text-graphite-900`} strokeWidth={2.5} />
            )}
          </div>
        ))}
      </div>

      {/* Reward label */}
      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${completed ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-white/4 border-white/8 text-white/50'}`}>
        <Zap className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
        <span>{completed ? `Reward earned: ${reward}` : `Earn ${reward} after ${card.punch_goal} purchases`}</span>
      </div>
    </motion.div>
  )
}
