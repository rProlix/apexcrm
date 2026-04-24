'use client'
// components/store/Checkout.tsx
import { useState } from 'react'
import { X, ShoppingCart, CheckCircle, AlertCircle, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export interface CartItem {
  product_id: string
  name:       string
  price:      number
  quantity:   number
}

interface Props {
  cart:      CartItem[]
  tenantId:  string
  onSuccess: () => void
  onCancel:  () => void
}

type CheckoutState = 'idle' | 'loading' | 'success' | 'error' | 'unauthenticated'

export function Checkout({ cart, onSuccess, onCancel }: Props) {
  const [state,    setState]    = useState<CheckoutState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [orderId,  setOrderId]  = useState<string | null>(null)

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const firstCurrency = 'USD'

  async function handleConfirm() {
    setState('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/store/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({
            product_id: i.product_id,
            quantity:   i.quantity,
          })),
        }),
      })

      const json = await res.json()

      if (res.status === 401) {
        setState('unauthenticated')
        return
      }

      if (!res.ok) {
        setState('error')
        setErrorMsg(json.error ?? 'Order failed. Please try again.')
        return
      }

      setOrderId(json.order?.id ?? null)
      setState('success')
    } catch {
      setState('error')
      setErrorMsg('Network error. Please check your connection and try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md premium-panel premium-border rounded-2xl p-6 shadow-panel-lg">

        {/* ── Success ── */}
        {state === 'success' && (
          <div className="text-center py-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-7 w-7 text-emerald-400" strokeWidth={1.75} />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Order Placed!</h2>
            <p className="text-sm text-white/50 mb-1">Your order has been confirmed.</p>
            {orderId && (
              <p className="text-xs text-white/30 font-mono mb-6">
                #{orderId.slice(0, 8).toUpperCase()}
              </p>
            )}
            <Button variant="primary" size="md" className="w-full" onClick={onSuccess}>
              Continue Shopping
            </Button>
          </div>
        )}

        {/* ── Unauthenticated ── */}
        {state === 'unauthenticated' && (
          <div className="text-center py-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
              <LogIn className="h-7 w-7 text-amber-400" strokeWidth={1.75} />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Sign In Required</h2>
            <p className="text-sm text-white/50 mb-6">
              Please sign in to your customer account to complete your purchase.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" size="md" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Link href="/login?next=/store" className="flex-1">
                <Button variant="primary" size="md" className="w-full">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Idle / Loading / Error ── */}
        {(state === 'idle' || state === 'loading' || state === 'error') && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
                </div>
                <h2 className="text-base font-bold text-white">Checkout</h2>
              </div>
              <button
                onClick={onCancel}
                className="h-8 w-8 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error banner */}
            {state === 'error' && errorMsg && (
              <div className="mb-4 flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{errorMsg}</p>
              </div>
            )}

            {/* Cart items */}
            <div className="space-y-2 mb-5">
              {cart.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center justify-between py-2.5 border-b border-white/6 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name}</p>
                    <p className="text-xs text-white/40">
                      {firstCurrency} {item.price.toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-white ml-4 shrink-0">
                    {firstCurrency} {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between rounded-xl bg-amber-400/6 border border-amber-400/15 px-4 py-3 mb-5">
              <span className="text-sm font-semibold text-white/80">Total</span>
              <span className="text-lg font-bold text-amber-400">
                {firstCurrency} {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={onCancel}
                disabled={state === 'loading'}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                loading={state === 'loading'}
                onClick={handleConfirm}
              >
                {state === 'error' ? 'Try Again' : 'Place Order'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
