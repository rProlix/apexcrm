'use client'
// components/store/ProductDetailClient.tsx
import { useState } from 'react'
import { Package, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkout } from '@/components/store/Checkout'

interface Product {
  id:              string
  name:            string
  description:     string | null
  price:           number
  currency:        string
  inventory_count: number
  is_active:       boolean
}

interface Props {
  product:  Product
  tenantId: string
}

export function ProductDetailClient({ product, tenantId }: Props) {
  const [quantity,     setQuantity]     = useState(1)
  const [showCheckout, setShowCheckout] = useState(false)

  const maxQty    = product.inventory_count
  const inStock   = maxQty > 0
  const lineTotal = Number(product.price) * quantity

  function decrement() { setQuantity((q) => Math.max(1, q - 1)) }
  function increment() { setQuantity((q) => Math.min(maxQty, q + 1)) }

  const cartItem = {
    product_id: product.id,
    name:       product.name,
    price:      Number(product.price),
    quantity,
  }

  return (
    <>
      <div className="premium-panel premium-border rounded-2xl p-6 md:p-8">
        {/* Product icon + header */}
        <div className="flex items-start gap-5 mb-6">
          <div className="h-16 w-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
            <Package className="h-8 w-8 text-amber-400" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white leading-snug mb-2">{product.name}</h1>
            <span className={`inline-flex text-xs px-2.5 py-1 rounded-lg border ${
              inStock
                ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                : 'text-white/30 bg-white/4 border-white/8'
            }`}>
              {inStock ? `${maxQty} in stock` : 'Out of stock'}
            </span>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-sm text-white/60 leading-relaxed mb-6">
            {product.description}
          </p>
        )}

        {/* Price */}
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/8">
          <div>
            <p className="text-xs text-white/40 mb-1">Price per item</p>
            <p className="text-3xl font-bold text-amber-400">
              {product.currency}{' '}
              {Number(product.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Quantity selector */}
        {inStock && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-white/40 mb-2">Quantity</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={decrement}
                  disabled={quantity <= 1}
                  className="h-9 w-9 rounded-xl bg-white/6 border border-white/8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-base font-bold text-white w-8 text-center">{quantity}</span>
                <button
                  onClick={increment}
                  disabled={quantity >= maxQty}
                  className="h-9 w-9 rounded-xl bg-white/6 border border-white/8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs text-white/40 mb-1">Total</p>
              <p className="text-xl font-bold text-white">
                {product.currency}{' '}
                {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* CTA */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!inStock}
          onClick={() => setShowCheckout(true)}
        >
          {inStock ? 'Proceed to Checkout' : 'Out of Stock'}
        </Button>

        {!inStock && (
          <p className="text-xs text-white/30 text-center mt-3">
            This product is currently unavailable.
          </p>
        )}
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <Checkout
          cart={[cartItem]}
          tenantId={tenantId}
          onSuccess={() => setShowCheckout(false)}
          onCancel={() => setShowCheckout(false)}
        />
      )}
    </>
  )
}
