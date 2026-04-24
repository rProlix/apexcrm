'use client'
// components/store/OrdersClient.tsx
import { useState } from 'react'
import { ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react'

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

interface OrderItem {
  id:         string
  product_id: string
  quantity:   number
  price:      number
}

interface Order {
  id:           string
  tenant_id:    string
  customer_id:  string
  status:       OrderStatus
  total_amount: number | null
  created_at:   string
  order_items:  OrderItem[]
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:    'text-amber-400    bg-amber-400/10    border-amber-400/20',
  confirmed:  'text-blue-400     bg-blue-400/10     border-blue-400/20',
  processing: 'text-purple-400   bg-purple-400/10   border-purple-400/20',
  shipped:    'text-cyan-400     bg-cyan-400/10     border-cyan-400/20',
  delivered:  'text-emerald-400  bg-emerald-400/10  border-emerald-400/20',
  cancelled:  'text-white/30     bg-white/4         border-white/8',
  refunded:   'text-red-400      bg-red-500/10      border-red-500/20',
}

const VALID_STATUSES: OrderStatus[] = [
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
]

interface Props {
  initialOrders: Order[]
}

export function OrdersClient({ initialOrders }: Props) {
  const [orders,    setOrders]    = useState<Order[]>(initialOrders)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [updating,  setUpdating]  = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter((o) => o.status === statusFilter)

  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)

  async function updateStatus(orderId: string, status: OrderStatus) {
    setUpdating(orderId)
    try {
      const res = await fetch(`/api/store/orders/${orderId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      if (res.ok) {
        const { order } = await res.json()
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...order } : o)))
      }
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Orders</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {orders.length} order{orders.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="premium-panel premium-border rounded-xl px-4 py-3 text-right">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-0.5">Revenue</p>
          <p className="text-xl font-bold text-emerald-400">
            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', ...VALID_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${
              statusFilter === s
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                : 'border-white/8 bg-white/4 text-white/40 hover:text-white hover:border-white/20'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              isExpanded={expanded === order.id}
              isUpdating={updating === order.id}
              onToggle={() => setExpanded((prev) => (prev === order.id ? null : order.id))}
              onStatusChange={(status) => updateStatus(order.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Order Row ────────────────────────────────────────────────────────────────

interface RowProps {
  order:          Order
  isExpanded:     boolean
  isUpdating:     boolean
  onToggle:       () => void
  onStatusChange: (status: OrderStatus) => void
}

function OrderRow({ order, isExpanded, isUpdating, onToggle, onStatusChange }: RowProps) {
  const style = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending

  return (
    <div className="premium-panel premium-border rounded-2xl overflow-hidden">
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/2 transition-colors text-left"
      >
        <div className="h-9 w-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
          <ShoppingCart className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-white/40">
            {new Date(order.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">
            ${Number(order.total_amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-white/40">
            {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
          </p>
        </div>

        <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border capitalize shrink-0 ${style}`}>
          {order.status}
        </span>

        {isExpanded
          ? <ChevronUp   className="h-4 w-4 text-white/30 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-white/30 shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-white/6 px-5 py-4 space-y-4">
          {/* Customer */}
          <div>
            <p className="text-xs text-white/40 mb-1 uppercase tracking-wider">Customer ID</p>
            <p className="text-xs text-white/60 font-mono">{order.customer_id}</p>
          </div>

          {/* Items */}
          {order.order_items.length > 0 && (
            <div>
              <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Items</p>
              <div className="space-y-1.5">
                {order.order_items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs text-white/60"
                  >
                    <span className="font-mono text-white/40">{item.product_id.slice(0, 8)}</span>
                    <span>× {item.quantity}</span>
                    <span className="text-white/80 font-medium">
                      ${(Number(item.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status change */}
          <div>
            <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {VALID_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={s === order.status || isUpdating}
                  onClick={() => onStatusChange(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors disabled:opacity-40 disabled:cursor-default ${
                    s === order.status
                      ? `${STATUS_STYLES[s]} opacity-100`
                      : 'border-white/8 bg-white/4 text-white/50 hover:text-white hover:border-white/20'
                  }`}
                >
                  {isUpdating && s !== order.status ? '…' : s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-4">
        <ShoppingCart className="h-8 w-8 text-amber-400/60" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">No orders yet</h3>
      <p className="text-sm text-white/40 max-w-xs">
        Orders placed by customers will appear here.
      </p>
    </div>
  )
}
