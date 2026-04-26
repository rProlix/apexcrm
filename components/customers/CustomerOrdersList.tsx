'use client'
// components/customers/CustomerOrdersList.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react'
import type { CustomerOrder } from '@/lib/customers/getCustomerOrders'

interface Props {
  orders:   CustomerOrder[]
  tenantId: string
  compact?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  cancelled: 'text-red-400 bg-red-400/10 border-red-400/20',
  refunded:  'text-orange-400 bg-orange-400/10 border-orange-400/20',
  processing:'text-blue-400 bg-blue-400/10 border-blue-400/20',
}

function OrderRow({ order }: { order: CustomerOrder }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-panel premium-border rounded-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
            <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-white/30">{new Date(order.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[order.status] ?? 'text-white/40 bg-white/4 border-white/8'}`}>
            {order.status}
          </span>
          <span className="text-sm font-bold text-white">${order.total_amount.toFixed(2)}</span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-white/30" />
            : <ChevronDown className="w-4 h-4 text-white/30" />
          }
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-2">
          {order.order_items.map(item => (
            <div key={item.id} className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white/80">
                  {item.product?.name ?? `Product ${item.product_id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-white/30">Qty: {item.quantity}</p>
              </div>
              <p className="text-xs font-semibold text-white/60">
                ${(item.price * item.quantity).toFixed(2)}
              </p>
            </div>
          ))}
          <div className="pt-2 border-t border-white/6 flex justify-between">
            <span className="text-xs text-white/40">Total</span>
            <span className="text-xs font-bold text-white">${order.total_amount.toFixed(2)}</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function CustomerOrdersList({ orders, tenantId: _tenantId, compact }: Props) {
  if (orders.length === 0) {
    return (
      <div className="premium-panel premium-border rounded-2xl py-12 flex flex-col items-center gap-3">
        <ShoppingBag className="w-8 h-8 text-white/20" />
        <p className="text-sm text-white/40">No orders found for this customer</p>
      </div>
    )
  }

  const displayed = compact ? orders.slice(0, 5) : orders

  return (
    <div className="space-y-2">
      {displayed.map(order => (
        <OrderRow key={order.id} order={order} />
      ))}
    </div>
  )
}
