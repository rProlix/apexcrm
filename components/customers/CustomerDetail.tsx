'use client'
// components/customers/CustomerDetail.tsx
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Mail, Phone, ArrowLeft, ShoppingBag, CreditCard, FileText,
  CheckCircle2, Circle, ExternalLink, Calendar
} from 'lucide-react'
import type { TenantCustomerDetail } from '@/lib/customers/getTenantCustomerById'
import type { CustomerOrder } from '@/lib/customers/getCustomerOrders'
import type { CustomerPaymentSummary } from '@/lib/customers/getCustomerPayments'
import type { CustomerProfile } from '@/lib/customers/getCustomerProfile'
import { CustomerActivityTimeline } from './CustomerActivityTimeline'

interface Props {
  customer:       TenantCustomerDetail
  recentOrders:   CustomerOrder[]
  recentPayments: CustomerPaymentSummary
  profile:        CustomerProfile | null
  tenantId:       string
  userRole:       string
  userEmail:      string
}

const STATUS_STYLES: Record<string, string> = {
  active:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  inactive: 'text-white/30 bg-white/4 border-white/8',
  banned:   'text-red-400 bg-red-400/10 border-red-400/20',
}

export function CustomerDetail({
  customer, recentOrders, recentPayments, profile, tenantId: _tenantId, userRole, userEmail: _userEmail,
}: Props) {
  const initials = customer.name
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const totalSpend = recentPayments.transactions
    .filter(t => t.status === 'succeeded')
    .reduce((sum, t) => sum + t.amount, 0)

  const canManage = userRole === 'owner' || userRole === 'admin'

  return (
    <div className="space-y-8">
      {/* Back nav */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All Customers
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="premium-panel premium-border rounded-2xl p-6"
      >
        <div className="flex items-start gap-5">
          <div className="h-16 w-16 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-glow-gold flex-shrink-0">
            <span className="text-graphite-900 font-bold text-xl">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {customer.display_name ?? customer.name}
              </h1>
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLES[customer.status] ?? STATUS_STYLES.active}`}>
                {customer.status === 'active'
                  ? <CheckCircle2 className="w-3 h-3" />
                  : <Circle className="w-3 h-3" />
                }
                {customer.status}
              </span>
              {customer.has_account && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-full font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  Portal access
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              {customer.email && (
                <span className="flex items-center gap-1.5 text-sm text-white/50">
                  <Mail className="w-3.5 h-3.5 text-white/30" />
                  {customer.email}
                </span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1.5 text-sm text-white/50">
                  <Phone className="w-3.5 h-3.5 text-white/30" />
                  {customer.phone}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-white/30">
                <Calendar className="w-3.5 h-3.5" />
                Since {new Date(customer.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          {canManage && (
            <Link
              href={`/customers/${customer.id}/profile`}
              className="flex-shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold border border-gold-500/30 text-gold-400 hover:bg-gold-500/8 transition-colors"
            >
              Edit Profile
            </Link>
          )}
        </div>
      </motion.div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: ShoppingBag, label: 'Orders',       value: recentOrders.length,                  color: 'text-amber-400',  bg: 'bg-amber-400/10',  href: `/customers/${customer.id}/orders` },
          { icon: CreditCard,  label: 'Transactions', value: recentPayments.transactions.length,    color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   href: `/customers/${customer.id}/payments` },
          { icon: FileText,    label: 'Total Spend',  value: `$${totalSpend.toFixed(2)}`,           color: 'text-gold-400',   bg: 'bg-gold-400/10',   href: `/customers/${customer.id}/payments` },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
          >
            <Link
              href={s.href}
              className="group premium-panel premium-border rounded-2xl p-4 flex items-center gap-3 hover:border-gold-500/30 transition-all duration-200"
            >
              <div className={`h-9 w-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-base font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/40">{s.label}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-gold-400 ml-auto transition-colors" />
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent orders + payments + activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="premium-panel premium-border rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white text-sm">Recent Orders</h2>
            <Link href={`/customers/${customer.id}/orders`} className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-xs text-white/30 py-4 text-center">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-white/4 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-white/80">{order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-white/30">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-white">${order.total_amount.toFixed(2)}</p>
                    <p className={`text-xs capitalize ${order.status === 'completed' ? 'text-emerald-400' : order.status === 'pending' ? 'text-yellow-400' : 'text-white/30'}`}>
                      {order.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Activity timeline */}
        <CustomerActivityTimeline customer={customer} orders={recentOrders} payments={recentPayments} />
      </div>

      {/* Profile notes preview */}
      {profile && profile.notes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="premium-panel premium-border rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white text-sm">Recent Notes</h2>
            <Link href={`/customers/${customer.id}/profile`} className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
              Edit profile →
            </Link>
          </div>
          <div className="space-y-3">
            {profile.notes.slice(-3).reverse().map(note => (
              <div key={note.id} className="border-l-2 border-gold-500/30 pl-3">
                <p className="text-xs text-white/70 leading-relaxed">{note.text}</p>
                <p className="text-xs text-white/30 mt-1">{note.author} · {new Date(note.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
