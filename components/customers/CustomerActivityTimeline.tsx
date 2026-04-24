'use client'
// components/customers/CustomerActivityTimeline.tsx
import { motion } from 'framer-motion'
import { ShoppingBag, CreditCard, FileText, UserPlus, Activity } from 'lucide-react'
import type { TenantCustomerDetail } from '@/lib/customers/getTenantCustomerById'
import type { CustomerOrder } from '@/lib/customers/getCustomerOrders'
import type { CustomerPaymentSummary } from '@/lib/customers/getCustomerPayments'

interface TimelineEvent {
  id:      string
  type:    'order' | 'payment' | 'invoice' | 'signup'
  label:   string
  sub:     string
  date:    Date
  amount?: number
  status:  string
}

interface Props {
  customer: TenantCustomerDetail
  orders:   CustomerOrder[]
  payments: CustomerPaymentSummary
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  order:   ShoppingBag,
  payment: CreditCard,
  invoice: FileText,
  signup:  UserPlus,
}

const EVENT_COLORS: Record<string, string> = {
  order:   'text-amber-400 bg-amber-400/10',
  payment: 'text-cyan-400 bg-cyan-400/10',
  invoice: 'text-gold-400 bg-gold-400/10',
  signup:  'text-emerald-400 bg-emerald-400/10',
}

export function CustomerActivityTimeline({ customer, orders, payments }: Props) {
  const events: TimelineEvent[] = [
    // Account creation
    {
      id:     'signup',
      type:   'signup' as const,
      label:  'Customer created',
      sub:    'Added to your CRM',
      date:   new Date(customer.created_at),
      status: 'info',
    },
    // Orders
    ...orders.map(o => ({
      id:     `order-${o.id}`,
      type:   'order' as const,
      label:  `Order placed`,
      sub:    `${o.order_items.length} item${o.order_items.length !== 1 ? 's' : ''}`,
      date:   new Date(o.created_at),
      amount: o.total_amount,
      status: o.status,
    })),
    // Transactions
    ...payments.transactions.map(tx => ({
      id:     `tx-${tx.id}`,
      type:   'payment' as const,
      label:  `Payment ${tx.transaction_type}`,
      sub:    tx.provider_key,
      date:   new Date(tx.created_at),
      amount: tx.amount,
      status: tx.status,
    })),
    // Invoices
    ...payments.invoices.map(inv => ({
      id:     `inv-${inv.id}`,
      type:   'invoice' as const,
      label:  `Invoice #${inv.invoice_number}`,
      sub:    inv.title,
      date:   new Date(inv.created_at),
      amount: inv.amount,
      status: inv.status,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 12)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="premium-panel premium-border rounded-2xl p-5"
    >
      <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-gold-400" />
        Activity
      </h2>

      {events.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-6">No activity yet</p>
      ) : (
        <div className="relative">
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-white/6" />
          <div className="space-y-4">
            {events.map((event, i) => {
              const Icon = EVENT_ICONS[event.type] ?? Activity
              const colorClass = EVENT_COLORS[event.type] ?? 'text-white/40 bg-white/4'
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-start gap-3 pl-7 relative"
                >
                  <div className={`absolute left-0 h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white/80 truncate">{event.label}</p>
                      {event.amount !== undefined && (
                        <p className="text-xs font-semibold text-white flex-shrink-0">
                          ${event.amount.toFixed(2)}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-white/30">
                      {event.sub} · {event.date.toLocaleDateString()}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}
