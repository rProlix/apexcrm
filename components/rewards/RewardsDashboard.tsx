'use client'
// components/rewards/RewardsDashboard.tsx
import { motion } from 'framer-motion'
import { Star, Gift, CreditCard, TrendingUp, Users, ShoppingBag, Zap } from 'lucide-react'
import Link from 'next/link'
import type { RewardsProgram, RewardsTransaction } from '@/types/rewards'

interface Stats {
  members:           number
  totalIssued:       number
  totalRedeemed:     number
  shopItems:         number
  activePunchCards:  number
}

interface Props {
  tenantId:           string
  program:            RewardsProgram | null
  stats:              Stats
  recentTransactions: Partial<RewardsTransaction>[]
}

const statCards = [
  { key: 'members',         label: 'Members',           icon: Users,       color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  { key: 'totalIssued',     label: 'Points Issued',     icon: TrendingUp,  color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20' },
  { key: 'totalRedeemed',   label: 'Points Redeemed',   icon: CreditCard,  color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  { key: 'shopItems',       label: 'Shop Items',        icon: ShoppingBag, color: 'text-gold-400',   bg: 'bg-gold-400/10',   border: 'border-gold-400/20' },
  { key: 'activePunchCards',label: 'Active Punch Cards',icon: Zap,         color: 'text-emerald-400',bg: 'bg-emerald-400/10',border: 'border-emerald-400/20' },
]

const navLinks = [
  { href: '/dashboard/rewards/programs',    label: 'Programs',    icon: Star },
  { href: '/dashboard/rewards/shop',        label: 'Shop Items',  icon: Gift },
  { href: '/dashboard/rewards/punch-cards', label: 'Punch Cards', icon: Zap },
  { href: '/dashboard/rewards/history',     label: 'History',     icon: TrendingUp },
  { href: '/dashboard/rewards/settings',    label: 'Settings',    icon: CreditCard },
]

function txTypeLabel(type: string) {
  switch (type) {
    case 'earned':   return { label: 'Earned',   color: 'text-emerald-400' }
    case 'redeemed': return { label: 'Redeemed', color: 'text-orange-400' }
    case 'adjusted': return { label: 'Adjusted', color: 'text-blue-400' }
    case 'bonus':    return { label: 'Bonus',    color: 'text-yellow-400' }
    default:         return { label: type,       color: 'text-white/60' }
  }
}

export function RewardsDashboard({ program, stats, recentTransactions }: Props) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="h-12 w-12 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
          <Star className="h-6 w-6 text-yellow-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Rewards</h1>
          <p className="text-sm text-white/40">
            {program ? `Program: ${program.name}` : 'No active program — create one to get started'}
          </p>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`premium-panel premium-border rounded-2xl p-4 border ${card.border}`}
          >
            <div className={`h-8 w-8 rounded-xl ${card.bg} border ${card.border} flex items-center justify-center mb-3`}>
              <card.icon className={`h-4 w-4 ${card.color}`} strokeWidth={1.75} />
            </div>
            <p className={`text-xl font-bold ${card.color}`}>
              {stats[card.key as keyof Stats].toLocaleString()}
            </p>
            <p className="text-xs text-white/40 mt-0.5">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick nav */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group premium-panel premium-border rounded-xl p-4 flex items-center gap-3 hover:border-gold-500/40 transition-all duration-200 cursor-pointer"
          >
            <div className="h-8 w-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center group-hover:bg-gold-400/16 transition-colors">
              <link.icon className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">{link.label}</span>
          </Link>
        ))}
      </motion.div>

      {/* Program status */}
      {!program && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="premium-panel premium-border rounded-2xl p-8 text-center border-yellow-400/20"
        >
          <div className="h-14 w-14 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto mb-4">
            <Star className="h-7 w-7 text-yellow-400/50" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-2">No Rewards Program</h3>
          <p className="text-sm text-white/40 mb-5">Create a rewards program to start issuing points and punch cards.</p>
          <Link
            href="/dashboard/rewards/programs"
            className="inline-flex items-center gap-2 bg-gold-gradient text-graphite-900 font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            <Star className="h-4 w-4" />
            Create Program
          </Link>
        </motion.div>
      )}

      {/* Recent transactions */}
      {recentTransactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="premium-panel premium-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link href="/dashboard/rewards/history" className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
              View all
            </Link>
          </div>
          <div className="divide-y divide-white/4">
            {recentTransactions.map((tx, i) => {
              const { label, color } = txTypeLabel(tx.transaction_type ?? '')
              return (
                <div key={tx.id ?? i} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md bg-white/6 ${color}`}>{label}</span>
                    <span className="text-xs text-white/40">
                      {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${(tx.points_delta ?? 0) > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                    {(tx.points_delta ?? 0) > 0 ? '+' : ''}{tx.points_delta?.toLocaleString() ?? 0} pts
                  </span>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
