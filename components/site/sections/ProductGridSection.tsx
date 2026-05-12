// components/site/sections/ProductGridSection.tsx
import Image from 'next/image'
// Server component — fetches live products from the store module.
import Link from 'next/link'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { ProductGridContent } from '@/lib/website/types'

import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              ProductGridContent
  tenantId:             string
  componentAnimations?: SectionComponentAnimations
}

interface Product {
  id:          string
  name:        string
  description: string | null
  price:       number
  image_url:   string | null
  status:      string
}

export async function ProductGridSection({ content, tenantId, componentAnimations: ca }: Props) {
  const c        = (content && typeof content === 'object' ? content : {}) as Partial<ProductGridContent>
  const headline = typeof c.headline === 'string' ? c.headline : ''
  const subtitle = typeof c.subtitle === 'string' ? c.subtitle : ''
  const limit    = typeof c.limit === 'number'    ? c.limit    : 8
  const showAll  = c.showAll !== false
  const allHref  = typeof c.allHref === 'string'  ? c.allHref  : '/shop'

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productsRaw } = await (db as any)
    .from('products')
    .select('id, name, description, price, currency, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  const items = (productsRaw ?? []) as Product[]
  if (items.length === 0) return null

  return (
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Heading */}
        {(headline || subtitle) && (
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            {headline && (
              <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
                fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color:      'var(--color-text)',
                margin:     '0 0 0.5rem',
              }}>{headline}</AnimatedElement>
            )}
            {subtitle && (
              <p style={{ color: 'var(--color-muted)', margin: 0 }}>{subtitle}</p>
            )}
          </div>
        )}

        {/* Grid */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap:                 '1.25rem',
        }}>
          {items.map((product, idx) => (
            <AnimatedElement key={product.id} animConfig={ca?.card ?? ca?.product_card} index={idx}>
            <Link
              href={`/shop/${product.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                background:   'var(--color-surface)',
                border:       '1px solid var(--color-border)',
                borderRadius: '1rem',
                overflow:     'hidden',
                transition:   'transform 0.15s, box-shadow 0.15s',
                cursor:       'pointer',
              }}>
                {/* Image */}
                <div style={{
                  background: 'var(--color-border)',
                  height:     200,
                  overflow:   'hidden',
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {product.image_url
                    ? <Image
                        src={product.image_url}
                        alt={product.name}
                        width={400}
                        height={400}
                        unoptimized
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    : <span style={{ fontSize: '2.5rem', opacity: 0.3 }}>📦</span>
                  }
                </div>

                {/* Info */}
                <div style={{ padding: '1.125rem' }}>
                  <h3 style={{
                    margin:     '0 0 0.25rem',
                    fontSize:   '0.9375rem',
                    fontWeight: 600,
                    color:      'var(--color-text)',
                  }}>
                    {product.name}
                  </h3>
                  {product.description && (
                    <p style={{
                      margin:   '0 0 0.875rem',
                      fontSize: '0.8125rem',
                      color:    'var(--color-muted)',
                      overflow: 'hidden',
                      display:  '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {product.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '1rem' }}>
                      ${Number(product.price).toFixed(2)}
                    </span>
                    <span style={{
                      background:   'var(--color-primary)',
                      color:        '#fff',
                      fontSize:     '0.75rem',
                      fontWeight:   600,
                      padding:      '0.3rem 0.75rem',
                      borderRadius: '0.5rem',
                    }}>
                      View
                    </span>
                  </div>
                </div>
              </div>
            </Link>
            </AnimatedElement>
          ))}
        </div>

        {/* View all */}
        {showAll && items.length >= limit && (
          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link href={allHref} style={{
              display:        'inline-block',
              background:     'var(--color-surface)',
              border:         '1px solid var(--color-border)',
              color:          'var(--color-text)',
              padding:        '0.75rem 2rem',
              borderRadius:   '0.875rem',
              fontWeight:     600,
              textDecoration: 'none',
              fontSize:       '0.9375rem',
            }}>
              View All Products →
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
