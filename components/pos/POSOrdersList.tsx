'use client'

import { useState } from 'react'
import { Search, Filter, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { formatCents } from '@/lib/pos/calculateOrder'

interface Order {
  id:             string
  order_number:   string
  status:         string
  payment_status: string
  total_cents:    number
  created_at:     string
  table_name?:    string | null
  customer_name?: string | null
}

interface Props {
  tenantId:      string
  initialOrders: Order[]
}

const STATUS_COLORS: Record<string, string> = {
  draft:            'text-zinc-400 bg-zinc-800',
  open:             'text-blue-400 bg-blue-500/10',
  sent_to_kitchen:  'text-yellow-400 bg-yellow-500/10',
  preparing:        'text-orange-400 bg-orange-500/10',
  ready:            'text-green-400 bg-green-500/10',
  completed:        'text-emerald-400 bg-emerald-500/10',
  cancelled:        'text-red-400 bg-red-500/10',
  refunded:         'text-purple-400 bg-purple-500/10',
}

const PAYMENT_COLORS: Record<string, string> = {
  unpaid:           'text-red-400',
  partially_paid:   'text-yellow-400',
  paid:             'text-green-400',
  refunded:         'text-purple-400',
}

export function POSOrdersList({ tenantId, initialOrders }: Props) {
  const [orders, setOrders]         = useState<Order[]>(initialOrders)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [loading, setLoading]       = useState(false)

  const filtered = orders.filter((o) => {
    const matchSearch = !search ||
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.table_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const fetchOrders = async (status?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const res = await fetch(`/api/pos/orders?${params}`)
      const data = await res.json()
      setOrders(data.orders ?? [])
    } catch { /* silent */ } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">POS Orders</h1>
            <p className="text-sm text-zinc-400 mt-1">{orders.length} orders</p>
          </div>
          <Link href="/pos" className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
            + New Order
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search order number, customer, table…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {['', 'open', 'sent_to_kitchen', 'ready', 'completed', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); if (s !== statusFilter) fetchOrders(s) }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-violet-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Orders table */}
        {loading ? (
          <div className="text-center py-20 text-zinc-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">No orders found</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => (
              <Link
                key={order.id}
                href={`/pos/orders/${order.id}`}
                className="flex items-center gap-4 p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-bold text-zinc-100">{order.order_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'text-zinc-400 bg-zinc-800'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-medium ${PAYMENT_COLORS[order.payment_status] ?? 'text-zinc-500'}`}>
                      {order.payment_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    {order.customer_name && <span>👤 {order.customer_name}</span>}
                    {order.table_name && <span>🪑 {order.table_name}</span>}
                    <span>{new Date(order.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-violet-400">{formatCents(order.total_cents)}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
