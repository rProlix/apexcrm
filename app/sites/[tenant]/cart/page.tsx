'use client'
// app/sites/[tenant]/cart/page.tsx — Shopping cart (client component)
import Link from 'next/link'
import { useState } from 'react'

interface CartItem {
  id:    string
  name:  string
  price: number
  qty:   number
}

export default function CartPage() {
  const [items] = useState<CartItem[]>([])

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          fontSize:   'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          color:      'var(--color-text)',
          margin:     '0 0 2rem',
        }}>
          Your Cart
        </h1>

        {items.length === 0 ? (
          <div style={{
            textAlign:  'center',
            padding:    '4rem 1.5rem',
            color:      'var(--color-muted)',
          }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Your cart is empty.</p>
            <Link href="/shop" style={{
              display:        'inline-block',
              background:     'var(--color-primary)',
              color:          '#fff',
              padding:        '0.75rem 1.75rem',
              borderRadius:   '0.75rem',
              fontWeight:     600,
              textDecoration: 'none',
            }}>
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((item) => (
              <div key={item.id} style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '1rem',
                background:   'var(--color-surface)',
                border:       '1px solid var(--color-border)',
                borderRadius: '0.875rem',
                padding:      '1rem 1.25rem',
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>{item.name}</p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                    ${item.price.toFixed(2)} × {item.qty}
                  </p>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                  ${(item.price * item.qty).toFixed(2)}
                </span>
              </div>
            ))}

            {/* Total + Checkout */}
            <div style={{
              background:   'var(--color-surface)',
              border:       '1px solid var(--color-border)',
              borderRadius: '0.875rem',
              padding:      '1.25rem',
              marginTop:    '0.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Total</span>
                <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-primary)' }}>
                  ${total.toFixed(2)}
                </span>
              </div>
              <Link href="/checkout" style={{
                display:        'block',
                background:     'var(--color-primary)',
                color:          '#fff',
                textAlign:      'center',
                padding:        '0.875rem',
                borderRadius:   '0.75rem',
                fontWeight:     700,
                textDecoration: 'none',
              }}>
                Proceed to Checkout
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
