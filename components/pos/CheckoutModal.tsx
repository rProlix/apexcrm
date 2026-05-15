'use client'

import { useState } from 'react'
import { X, CreditCard, Banknote, Smartphone, Plus } from 'lucide-react'
import { formatCents, calculateOrder } from '@/lib/pos/calculateOrder'
import type { CartItem, POSSettings } from '@/lib/pos/types'

interface Props {
  cart:           CartItem[]
  calc:           ReturnType<typeof calculateOrder>
  customer:       { id: string; name: string } | null
  orderType:      string
  tableName:      string
  guestCount:     number | ''
  globalDiscount: { type: 'percent' | 'fixed_amount'; value: number } | null
  settings:       POSSettings | null
  shiftId:        string | null
  onSuccess:      () => void
  onClose:        () => void
}

type PaymentMethod = 'cash' | 'card' | 'tap' | 'manual_card'

export function CheckoutModal({ cart, calc, customer, orderType, tableName, guestCount, globalDiscount, settings, shiftId, onSuccess, onClose }: Props) {
  const [method, setMethod]             = useState<PaymentMethod>('cash')
  const [tipCents, setTipCents]         = useState(0)
  const [cashReceived, setCashReceived] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [split, setSplit]               = useState<{ method: PaymentMethod; amount: string }[]>([])
  const [isSplit, setIsSplit]           = useState(false)

  // Recalculate with tip
  const finalCalc = calculateOrder({
    items:    cart,
    discount: globalDiscount,
    tip_cents: tipCents,
    settings:  settings ?? { default_tax_rate: 0, service_fee_enabled: false, service_fee_percent: 0, tips_enabled: true },
  })

  const cashReceivedCents = cashReceived ? Math.round(parseFloat(cashReceived) * 100) : 0
  const changeDue = cashReceivedCents > finalCalc.total_cents ? cashReceivedCents - finalCalc.total_cents : 0

  const tipOptions = settings?.tips_enabled !== false
    ? [
        { label: '15%', value: Math.round(finalCalc.subtotal_cents * 0.15) },
        { label: '18%', value: Math.round(finalCalc.subtotal_cents * 0.18) },
        { label: '20%', value: Math.round(finalCalc.subtotal_cents * 0.20) },
        { label: '25%', value: Math.round(finalCalc.subtotal_cents * 0.25) },
      ]
    : []

  const handleCharge = async () => {
    setIsProcessing(true); setError(null)
    try {
      // 1. Create the order
      const orderRes = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items:      cart,
          discount:   globalDiscount,
          tip_cents:  tipCents,
          status:     'open',
          order_type: orderType,
          table_name: tableName || null,
          guest_count: guestCount || null,
          customer_id: customer?.id ?? null,
          shift_id:   shiftId,
        }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) { setError(orderData.error ?? 'Failed to create order'); return }
      const orderId = orderData.order.id

      if (isSplit) {
        // Split payments
        for (const s of split) {
          if (!s.amount || parseFloat(s.amount) <= 0) continue
          const payRes = await fetch(`/api/pos/orders/${orderId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment_method:   s.method,
              payment_provider: s.method === 'cash' ? 'cash' : 'manual',
              amount_cents:     Math.round(parseFloat(s.amount) * 100),
              tip_cents:        0,
            }),
          })
          if (!payRes.ok) { const pd = await payRes.json(); setError(pd.error ?? 'Payment failed'); return }
        }
      } else {
        // Single payment
        const payRes = await fetch(`/api/pos/orders/${orderId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_method:   method,
            payment_provider: method === 'cash' ? 'cash' : 'manual',
            amount_cents:     finalCalc.total_cents,
            tip_cents:        tipCents,
          }),
        })
        if (!payRes.ok) { const pd = await payRes.json(); setError(pd.error ?? 'Payment failed'); return }
      }

      onSuccess()
    } catch { setError('Network error') } finally { setIsProcessing(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md bg-zinc-900 sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Checkout</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          {/* Order summary */}
          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatCents(finalCalc.subtotal_cents)}</span></div>
            {finalCalc.discount_cents > 0 && <div className="flex justify-between text-green-400"><span>Discount</span><span>−{formatCents(finalCalc.discount_cents)}</span></div>}
            {finalCalc.tax_cents > 0 && <div className="flex justify-between text-zinc-400"><span>Tax</span><span>{formatCents(finalCalc.tax_cents)}</span></div>}
            {finalCalc.service_fee_cents > 0 && <div className="flex justify-between text-zinc-400"><span>Service Fee</span><span>{formatCents(finalCalc.service_fee_cents)}</span></div>}
            {tipCents > 0 && <div className="flex justify-between text-zinc-400"><span>Tip</span><span>{formatCents(tipCents)}</span></div>}
            <div className="flex justify-between text-base font-bold text-zinc-100 border-t border-zinc-700 pt-2 mt-1">
              <span>Total</span>
              <span className="text-violet-400">{formatCents(finalCalc.total_cents)}</span>
            </div>
          </div>

          {/* Tip options */}
          {tipOptions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-zinc-300 mb-2">Tip</p>
              <div className="grid grid-cols-4 gap-2">
                {tipOptions.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setTipCents(tipCents === t.value ? 0 : t.value)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${tipCents === t.value ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-zinc-500">Custom:</span>
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  onChange={(e) => setTipCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                  className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          )}

          {/* Payment method */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-zinc-300">Payment Method</p>
              <button
                onClick={() => setIsSplit(!isSplit)}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                {isSplit ? 'Single payment' : 'Split payment'}
              </button>
            </div>

            {!isSplit ? (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'cash' as PaymentMethod,        label: 'Cash',        icon: Banknote },
                  { id: 'card' as PaymentMethod,        label: 'Card',        icon: CreditCard },
                  { id: 'tap' as PaymentMethod,         label: 'Tap to Pay',  icon: Smartphone },
                  { id: 'manual_card' as PaymentMethod, label: 'Manual Card', icon: CreditCard },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${method === m.id ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
                  >
                    <m.icon className="w-4 h-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {split.map((s, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select
                      value={s.method}
                      onChange={(e) => setSplit((p) => p.map((x, i) => i === idx ? { ...x, method: e.target.value as PaymentMethod } : x))}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="tap">Tap</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={s.amount}
                      onChange={(e) => setSplit((p) => p.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                      className="w-28 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500"
                    />
                    <button onClick={() => setSplit((p) => p.filter((_, i) => i !== idx))} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button
                  onClick={() => setSplit((p) => [...p, { method: 'cash', amount: '' }])}
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-violet-400 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add payment
                </button>
              </div>
            )}
          </div>

          {/* Cash change calculation */}
          {method === 'cash' && !isSplit && (
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1.5">Cash Received</label>
              <input
                type="number"
                placeholder={`${(finalCalc.total_cents / 100).toFixed(2)}`}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
              {cashReceivedCents > 0 && (
                <div className={`mt-2 flex justify-between text-sm font-bold ${changeDue > 0 ? 'text-green-400' : cashReceivedCents < finalCalc.total_cents ? 'text-red-400' : 'text-zinc-400'}`}>
                  <span>{changeDue > 0 ? 'Change Due' : cashReceivedCents < finalCalc.total_cents ? 'Remaining' : 'Exact'}</span>
                  <span>{changeDue > 0 ? formatCents(changeDue) : cashReceivedCents < finalCalc.total_cents ? formatCents(finalCalc.total_cents - cashReceivedCents) : '✓'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Charge button */}
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleCharge}
            disabled={isProcessing}
            className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-base transition-colors disabled:opacity-50"
          >
            {isProcessing ? 'Processing…' : `Charge ${formatCents(finalCalc.total_cents)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
