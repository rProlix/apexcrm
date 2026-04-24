// app/(customer)/portal/customers/orders/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerOrders } from '@/lib/customers/getCustomerOrders'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  cancelled: 'text-red-400 bg-red-400/10 border-red-400/20',
  refunded:  'text-orange-400 bg-orange-400/10 border-orange-400/20',
  processing:'text-blue-400 bg-blue-400/10 border-blue-400/20',
}

export default async function CustomerPortalOrdersPage() {
  const host = headers().get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const orders = await getCustomerOrders(ctx.tenant_id, ctx.customer_id, 100)

  return (
    <div className="space-y-6">
      <Link
        href="/portal/customers"
        className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to account
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">My Orders</h1>
        <p className="text-sm text-white/40 mt-1">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
      </div>

      {orders.length === 0 ? (
        <div className="premium-panel premium-border rounded-2xl py-16 flex flex-col items-center gap-4">
          <ShoppingBag className="w-10 h-10 text-white/20" />
          <p className="text-sm text-white/40">You haven&apos;t placed any orders yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="premium-panel premium-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-white/30">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${STATUS_STYLES[order.status] ?? 'text-white/40 border-white/10 bg-white/4'}`}>
                    {order.status}
                  </span>
                  <span className="font-bold text-white">${order.total_amount.toFixed(2)}</span>
                </div>
              </div>
              <div className="space-y-1.5 pt-3 border-t border-white/6">
                {order.order_items.map(item => (
                  <div key={item.id} className="flex items-center justify-between">
                    <p className="text-xs text-white/60">
                      {item.product?.name ?? `Product`}
                      <span className="text-white/30"> × {item.quantity}</span>
                    </p>
                    <p className="text-xs text-white/40">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
