'use client'
// components/payments/PaymentsDashboard.tsx
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  CreditCard, TrendingUp, Clock, XCircle, RotateCcw,
  ArrowRight, Zap, BarChart3, Receipt
} from 'lucide-react'
import { RevenueSummary } from './RevenueSummary'
import { formatCurrency } from '@/lib/payments/formatCurrency'

interface DailyRevenue {
  date:   string
  amount: number
  count:  number
}

interface RecentTransaction {
  id:               string
  amount:           number
  currency:         string
  status:           string
  transaction_type: string
  provider_key:     string
  created_at:       string
}

interface Provider {
  id:          string
  provider_key: string
  is_enabled:  boolean
  is_default:  boolean
  created_at:  string
}

interface RevenueStats {
  totalRevenue:     number
  monthRevenue:     number
  weekRevenue:      number
  pendingAmount:    number
  failedCount:      number
  refundedAmount:   number
  transactionCount: number
  currency:         string
}

interface Props {
  revenue:             RevenueStats
  dailyRevenue:        DailyRevenue[]
  currency:            string
  recentTransactions:  RecentTransaction[]
  providers:           Provider[]
  tenantId:            string
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  pending:   'text-yellow-400  bg-yellow-400/10  border-yellow-400/20',
  failed:    'text-red-400     bg-red-400/10     border-red-400/20',
  refunded:  'text-orange-400  bg-orange-400/10  border-orange-400/20',
  canceled:  'text-white/40    bg-white/4        border-white/8',
}

const PROVIDER_NAMES: Record<string, string> = { stripe: 'Stripe', square: 'Square' }

export function PaymentsDashboard({ revenue, dailyRevenue, currency, recentTransactions, providers, tenantId }: Props) {
  const fmt = (n: number) => formatCurrency(n, currency)

  const quickStats = [
    {
      label:   'Total Revenue',
      value:   fmt(revenue.totalRevenue),
      icon:    TrendingUp,
      color:   'text-gold-400',
      bg:      'bg-gold-400/10',
      border:  'border-gold-400/20',
      href:    '/payments/transactions',
    },
    {
      label:  'This Month',
      value:  fmt(revenue.monthRevenue),
      icon:   BarChart3,
      color:  'text-emerald-400',
      bg:     'bg-emerald-400/10',
      border: 'border-emerald-400/20',
      href:   '/payments/transactions',
    },
    {
      label:  'Pending',
      value:  fmt(revenue.pendingAmount),
      icon:   Clock,
      color:  'text-yellow-400',
      bg:     'bg-yellow-400/10',
      border: 'border-yellow-400/20',
      href:   '/payments/invoices?status=pending',
    },
    {
      label:  'Failed',
      value:  String(revenue.failedCount),
      icon:   XCircle,
      color:  'text-red-400',
      bg:     'bg-red-400/10',
      border: 'border-red-400/20',
      href:   '/payments/transactions?status=failed',
    },
    {
      label:  'Refunded',
      value:  fmt(revenue.refundedAmount),
      icon:   RotateCcw,
      color:  'text-orange-400',
      bg:     'bg-orange-400/10',
      border: 'border-orange-400/20',
      href:   '/payments/refunds',
    },
    {
      label:  'Transactions',
      value:  String(revenue.transactionCount),
      icon:   CreditCard,
      color:  'text-blue-400',
      bg:     'bg-blue-400/10',
      border: 'border-blue-400/20',
      href:   '/payments/transactions',
    },
  ]

  const navLinks = [
    { href: '/payments/invoices',     label: 'Invoices',      icon: Receipt },
    { href: '/payments/transactions', label: 'Transactions',  icon: CreditCard },
    { href: '/payments/links',        label: 'Payment Links', icon: Zap },
    { href: '/payments/refunds',      label: 'Refunds',       icon: RotateCcw },
    { href: '/payments/providers',    label: 'Providers',     icon: TrendingUp },
    { href: '/payments/settings',     label: 'Settings',      icon: BarChart3 },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payments</h1>
          <p className="text-sm text-white/40 mt-1">Revenue, invoices, and transaction management</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/payments/invoices"
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
          >
            <Receipt className="h-4 w-4" />
            New Invoice
          </Link>
        </div>
      </div>

      {/* Provider status strip */}
      {providers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-400/6 border border-yellow-400/20"
        >
          <Zap className="h-5 w-5 text-yellow-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-400">No payment provider connected</p>
            <p className="text-xs text-white/40 mt-0.5">Connect Stripe or Square to start accepting payments</p>
          </div>
          <Link
            href="/payments/providers"
            className="flex-shrink-0 text-xs font-semibold text-yellow-400 border border-yellow-400/30 rounded-lg px-3 py-1.5 hover:bg-yellow-400/8 transition-colors"
          >
            Connect provider
          </Link>
        </motion.div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          {providers.map((p) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
                p.is_enabled
                  ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                  : 'text-white/30 bg-white/4 border-white/8'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${p.is_enabled ? 'bg-emerald-400' : 'bg-white/20'}`} />
              {PROVIDER_NAMES[p.provider_key] ?? p.provider_key}
              {p.is_default && <span className="text-gold-400 ml-1">Default</span>}
            </span>
          ))}
          <Link
            href="/payments/providers"
            className="text-xs text-white/40 hover:text-gold-400 transition-colors flex items-center gap-1"
          >
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Revenue chart */}
      <RevenueSummary dailyRevenue={dailyRevenue} currency={currency} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {quickStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              href={stat.href}
              className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 rounded-2xl"
            >
              <div className="premium-panel premium-border rounded-2xl p-4 hover:shadow-panel-lg hover:border-white/12 transition-all duration-200">
                <div className={`h-9 w-9 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center mb-3`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} strokeWidth={1.75} />
                </div>
                <p className="text-xs text-white/40 mb-1">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color} leading-none`}>{stat.value}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick nav */}
      <div>
        <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Payment Modules</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 p-3 rounded-xl premium-panel premium-border hover:border-gold-500/30 hover:shadow-glow-gold/20 transition-all duration-200 group"
            >
              <div className="h-8 w-8 rounded-lg bg-gold-400/8 border border-gold-400/15 flex items-center justify-center">
                <link.icon className="h-4 w-4 text-gold-400/70 group-hover:text-gold-400 transition-colors" strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">{link.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-white/20 group-hover:text-gold-400/60 ml-auto transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      {recentTransactions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Recent Transactions</h2>
            <Link href="/payments/transactions" className="text-xs text-gold-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="premium-panel premium-border rounded-2xl divide-y divide-white/5">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-white/4 border border-white/8 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="h-3.5 w-3.5 text-white/40" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {PROVIDER_NAMES[tx.provider_key] ?? tx.provider_key}
                      {' · '}
                      {tx.transaction_type}
                    </p>
                    <p className="text-xs text-white/30">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[tx.status] ?? STATUS_STYLES.canceled}`}>
                    {tx.status}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(Number(tx.amount), tx.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
