'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Utensils, CheckCircle, XCircle, RotateCcw, Printer } from 'lucide-react'
import { formatCents } from '@/lib/pos/calculateOrder'

interface Props {
  order:    Record<string, unknown>
  tenantId: string
  userRole: string
}

const STATUS_COLORS: Record<string, string> = {
  open:            'text-blue-400 bg-blue-500/10 border-blue-500/20',
  sent_to_kitchen: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  preparing:       'text-orange-400 bg-orange-500/10 border-orange-500/20',
  ready:           'text-green-400 bg-green-500/10 border-green-500/20',
  completed:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  cancelled:       'text-red-400 bg-red-500/10 border-red-500/20',
  refunded:        'text-purple-400 bg-purple-500/10 border-purple-500/20',
}

export function POSOrderDetail({ order, tenantId, userRole }: Props) {
  const [status, setStatus]  = useState(order.status as string)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError]    = useState<string | null>(null)

  const items    = (order.pos_order_items as Record<string, unknown>[]) ?? []
  const payments = (order.pos_payments as Record<string, unknown>[]) ?? []
  const events   = (order.pos_order_events as Record<string, unknown>[]) ?? []
  const refunds  = (order.pos_refunds as Record<string, unknown>[]) ?? []
  const customer = order.customers as { name?: string; email?: string; phone?: string } | null

  const canEdit = ['open', 'draft'].includes(status)
  const canSendKitchen = !['completed','cancelled','refunded'].includes(status) && status !== 'sent_to_kitchen'
  const canComplete    = !['completed','cancelled','refunded'].includes(status)
  const canCancel      = !['completed','cancelled','refunded'].includes(status)
  const canRefund      = ['paid','partially_paid','completed'].includes(order.payment_status as string) && ['admin','owner','manager'].includes(userRole)

  const doAction = async (action: string, body?: Record<string, unknown>) => {
    setLoading(action); setError(null)
    try {
      const res = await fetch(`/api/pos/orders/${order.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? `${action} failed`); return }
      window.location.reload()
    } catch { setError('Network error') } finally { setLoading(null) }
  }

  const handleRefund = async () => {
    const reason = prompt('Refund reason:') ?? 'Customer refund'
    await doAction('refund', { reason })
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <Link href="/pos/orders" className="mt-1 p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-100 font-mono">{order.order_number as string}</h1>
              <span className={`px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[status] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'}`}>
                {status.replace(/_/g, ' ')}
              </span>
              <span className="text-sm text-zinc-500">{order.payment_status as string}</span>
            </div>
            <p className="text-sm text-zinc-500 mt-1">{new Date(order.created_at as string).toLocaleString()}</p>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {canSendKitchen && (
            <button onClick={() => doAction('send-to-kitchen')} disabled={loading === 'send-to-kitchen'}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-xl text-sm hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
              <Utensils className="w-4 h-4" />
              {loading === 'send-to-kitchen' ? 'Sending…' : 'Send to Kitchen'}
            </button>
          )}
          {canComplete && (
            <button onClick={() => doAction('complete')} disabled={loading === 'complete'}
              className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-sm hover:bg-green-500/20 transition-colors disabled:opacity-50">
              <CheckCircle className="w-4 h-4" />
              {loading === 'complete' ? 'Completing…' : 'Complete'}
            </button>
          )}
          {canCancel && (
            <button onClick={() => { const r = prompt('Reason for cancellation:'); if (r !== null) doAction('cancel', { reason: r }) }}
              disabled={loading === 'cancel'}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50">
              <XCircle className="w-4 h-4" />
              Cancel
            </button>
          )}
          {canRefund && (
            <button onClick={handleRefund} disabled={!!loading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl text-sm hover:bg-purple-500/20 transition-colors disabled:opacity-50">
              <RotateCcw className="w-4 h-4" />
              Refund
            </button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Left: items + payments */}
          <div className="lg:col-span-2 space-y-5">
            {/* Order items */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-200">Items</h2>
              </div>
              <div className="divide-y divide-zinc-800">
                {items.map((item) => {
                  const mods = (item.pos_order_item_modifiers as Record<string, unknown>[]) ?? []
                  return (
                    <div key={item.id as string} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-100">
                            <span className="text-zinc-500 mr-2">×{item.quantity as number}</span>
                            {item.name as string}
                          </p>
                          {mods.length > 0 && (
                            <div className="mt-1 space-y-0.5 ml-6">
                              {mods.map((m) => (
                                <p key={m.id as string} className="text-xs text-zinc-400">
                                  {m.modifier_type === 'removal' ? '— ' : '+ '}{m.name as string}
                                  {(m.price_delta_cents as number) !== 0 && ` (${formatCents(m.price_delta_cents as number)})`}
                                </p>
                              ))}
                            </div>
                          )}
                          {Boolean(item.notes || item.kitchen_notes) && (
                            <p className="text-xs text-zinc-500 mt-1 ml-6 italic">
                              {[String(item.notes ?? ''), String(item.kitchen_notes ?? '')].filter(Boolean).join(' | ')}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-bold text-violet-400 flex-none">{formatCents(item.total_cents as number)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Totals */}
              <div className="border-t border-zinc-800 px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-sm text-zinc-400"><span>Subtotal</span><span>{formatCents(order.subtotal_cents as number)}</span></div>
                {(order.discount_cents as number) > 0 && <div className="flex justify-between text-sm text-green-400"><span>Discount</span><span>−{formatCents(order.discount_cents as number)}</span></div>}
                {(order.tax_cents as number) > 0 && <div className="flex justify-between text-sm text-zinc-400"><span>Tax</span><span>{formatCents(order.tax_cents as number)}</span></div>}
                {(order.tip_cents as number) > 0 && <div className="flex justify-between text-sm text-zinc-400"><span>Tip</span><span>{formatCents(order.tip_cents as number)}</span></div>}
                <div className="flex justify-between text-base font-bold text-zinc-100 border-t border-zinc-700 pt-2"><span>Total</span><span className="text-violet-400">{formatCents(order.total_cents as number)}</span></div>
                <div className="flex justify-between text-sm text-zinc-400"><span>Paid</span><span className="text-green-400">{formatCents(order.amount_paid_cents as number)}</span></div>
                {(order.balance_due_cents as number) > 0 && <div className="flex justify-between text-sm font-bold text-red-400"><span>Balance Due</span><span>{formatCents(order.balance_due_cents as number)}</span></div>}
              </div>
            </div>

            {/* Payments */}
            {payments.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-200">Payments</h2>
                </div>
                <div className="divide-y divide-zinc-800">
                  {payments.map((p) => (
                    <div key={p.id as string} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-200 capitalize">{(p.payment_method as string).replace(/_/g, ' ')}</p>
                        <p className="text-xs text-zinc-500">{p.paid_at ? new Date(p.paid_at as string).toLocaleString() : 'Pending'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-400">{formatCents(p.amount_cents as number)}</p>
                        <p className={`text-xs capitalize ${p.status === 'paid' ? 'text-green-400' : 'text-zinc-500'}`}>{p.status as string}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: details + events */}
          <div className="space-y-5">
            {/* Customer */}
            {customer?.name && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-zinc-200 mb-2">Customer</h2>
                <p className="text-sm text-zinc-300">{customer.name}</p>
                {customer.email && <p className="text-xs text-zinc-500">{customer.email}</p>}
                {customer.phone && <p className="text-xs text-zinc-500">{customer.phone}</p>}
              </div>
            )}

            {/* Order info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-semibold text-zinc-200 mb-2">Details</h2>
              <InfoRow label="Type" value={(order.order_type as string).replace(/_/g, ' ')} />
              {Boolean(order.table_name) && <InfoRow label="Table" value={order.table_name as string} />}
              {Boolean(order.guest_count) && <InfoRow label="Guests" value={String(order.guest_count)} />}
              {Boolean(order.notes) && <InfoRow label="Notes" value={order.notes as string} />}
            </div>

            {/* Events */}
            {events.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-zinc-200 mb-3">History</h2>
                <div className="space-y-2">
                  {events.slice().reverse().map((e) => (
                    <div key={e.id as string} className="text-xs">
                      <p className="text-zinc-300">{e.message as string}</p>
                      <p className="text-zinc-600">{new Date(e.created_at as string).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 capitalize">{value}</span>
    </div>
  )
}
