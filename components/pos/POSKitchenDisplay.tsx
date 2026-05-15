'use client'

import { useState, useEffect, useCallback } from 'react'
import { Utensils, Clock, CheckCircle, ChefHat } from 'lucide-react'

interface KitchenTicket {
  id:        string
  status:    string
  sent_at:   string
  station?:  string | null
  notes?:    string | null
  pos_orders: {
    order_number: string
    order_type:   string
    table_name?:  string | null
    guest_count?: number | null
    notes?:       string | null
    kitchen_notes?: string | null
    pos_order_items: Array<{
      id:               string
      name:             string
      quantity:         number
      notes?:           string | null
      kitchen_notes?:   string | null
      fulfillment_status: string
      pos_order_item_modifiers: Array<{
        id:            string
        name:          string
        modifier_type: string
        quantity:      number
      }>
    }>
  }
}

interface Props {
  tenantId:       string
  initialTickets: KitchenTicket[]
}

const STATUS_CONFIG = {
  new:       { label: 'New',       color: 'border-red-500 bg-red-500/5',    dot: 'bg-red-500',    textColor: 'text-red-400' },
  accepted:  { label: 'Accepted',  color: 'border-blue-500 bg-blue-500/5',  dot: 'bg-blue-500',   textColor: 'text-blue-400' },
  preparing: { label: 'Preparing', color: 'border-yellow-500 bg-yellow-500/5', dot: 'bg-yellow-400', textColor: 'text-yellow-400' },
  ready:     { label: 'Ready',     color: 'border-green-500 bg-green-500/5', dot: 'bg-green-500',  textColor: 'text-green-400' },
}

function elapsed(sentAt: string) {
  const ms = Date.now() - new Date(sentAt).getTime()
  const mins = Math.floor(ms / 60000)
  return mins < 1 ? 'Just now' : `${mins}m ago`
}

export function POSKitchenDisplay({ tenantId, initialTickets }: Props) {
  const [tickets, setTickets] = useState<KitchenTicket[]>(initialTickets)
  const [now, setNow]         = useState(new Date())
  const [updating, setUpdating] = useState<string | null>(null)

  // Refresh timer for elapsed times
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // Auto-refresh tickets
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch('/api/pos/kitchen')
        const data = await res.json()
        if (data.tickets) setTickets(data.tickets)
      } catch { /* silent */ }
    }, 15000)
    return () => clearInterval(t)
  }, [])

  const updateTicket = useCallback(async (ticketId: string, newStatus: string) => {
    setUpdating(ticketId)
    try {
      await fetch(`/api/pos/kitchen/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      setTickets((prev) =>
        prev.map((t) => t.id === ticketId ? { ...t, status: newStatus } : t)
          .filter((t) => !['completed', 'cancelled'].includes(t.status))
      )
    } catch { /* silent */ } finally { setUpdating(null) }
  }, [])

  const columns = ['new', 'preparing', 'ready'] as const

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="flex items-center gap-3 mb-6">
        <ChefHat className="w-6 h-6 text-orange-400" />
        <h1 className="text-2xl font-bold text-zinc-100">Kitchen Display</h1>
        <span className="text-sm text-zinc-500 ml-auto">{tickets.length} active tickets</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => {
          const colTickets = tickets.filter((t) => t.status === col || (col === 'new' && t.status === 'accepted'))
          const cfg = STATUS_CONFIG[col]

          return (
            <div key={col}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                <h2 className={`text-sm font-bold uppercase tracking-wider ${cfg.textColor}`}>{cfg.label}</h2>
                <span className="text-xs text-zinc-600 ml-auto">{colTickets.length}</span>
              </div>

              <div className="space-y-3">
                {colTickets.map((ticket) => {
                  const order = ticket.pos_orders
                  const mins  = Math.floor((Date.now() - new Date(ticket.sent_at).getTime()) / 60000)
                  const urgent = mins >= 15

                  return (
                    <div
                      key={ticket.id}
                      className={`border-2 rounded-2xl p-4 transition-all ${cfg.color} ${urgent ? 'animate-pulse' : ''}`}
                    >
                      {/* Ticket header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-base font-bold text-zinc-100 font-mono">#{order.order_number}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-zinc-400 capitalize">{order.order_type.replace(/_/g, ' ')}</span>
                            {order.table_name && <span className="text-xs text-zinc-400">🪑 {order.table_name}</span>}
                            {order.guest_count && <span className="text-xs text-zinc-400">👥 {order.guest_count}</span>}
                          </div>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-bold ${urgent ? 'text-red-400' : 'text-zinc-500'}`}>
                          <Clock className="w-3 h-3" />
                          {mins < 1 ? '<1m' : `${mins}m`}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-2 mb-3">
                        {order.pos_order_items.map((item) => (
                          <div key={item.id} className="bg-zinc-900/50 rounded-xl p-3">
                            <p className="text-base font-semibold text-zinc-100">
                              <span className="text-zinc-400 mr-2">×{item.quantity}</span>
                              {item.name}
                            </p>
                            {item.pos_order_item_modifiers.length > 0 && (
                              <div className="mt-1.5 space-y-0.5 ml-5">
                                {item.pos_order_item_modifiers.map((m) => (
                                  <p key={m.id} className={`text-sm ${m.modifier_type === 'removal' ? 'text-red-400' : m.modifier_type === 'instruction' ? 'text-blue-400' : 'text-green-400'}`}>
                                    {m.modifier_type === 'removal' ? '✗' : m.modifier_type === 'instruction' ? '→' : '+'} {m.name}
                                    {m.quantity > 1 && ` ×${m.quantity}`}
                                  </p>
                                ))}
                              </div>
                            )}
                            {item.kitchen_notes && <p className="text-sm text-yellow-400 mt-1 ml-5 italic">⚡ {item.kitchen_notes}</p>}
                            {item.notes && <p className="text-sm text-zinc-500 mt-0.5 ml-5 italic">{item.notes}</p>}
                          </div>
                        ))}
                      </div>

                      {(order.kitchen_notes || order.notes) && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 mb-3">
                          <p className="text-sm text-yellow-400">{order.kitchen_notes || order.notes}</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {ticket.status === 'new' && (
                          <button
                            onClick={() => updateTicket(ticket.id, 'preparing')}
                            disabled={updating === ticket.id}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                        )}
                        {ticket.status === 'accepted' && (
                          <button
                            onClick={() => updateTicket(ticket.id, 'preparing')}
                            disabled={updating === ticket.id}
                            className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                          >
                            Start Preparing
                          </button>
                        )}
                        {ticket.status === 'preparing' && (
                          <button
                            onClick={() => updateTicket(ticket.id, 'ready')}
                            disabled={updating === ticket.id}
                            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                          >
                            Mark Ready ✓
                          </button>
                        )}
                        {ticket.status === 'ready' && (
                          <button
                            onClick={() => updateTicket(ticket.id, 'completed')}
                            disabled={updating === ticket.id}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {colTickets.length === 0 && (
                  <div className="text-center py-10 text-zinc-700 border-2 border-dashed border-zinc-800 rounded-2xl">
                    <p className="text-sm">No {cfg.label.toLowerCase()} tickets</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
