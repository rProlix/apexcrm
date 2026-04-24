// app/sites/[tenant]/shop/[id]/page.tsx — Public product detail page
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { getSupabaseServerClient } from '@/lib/supabase/server'

interface Props {
  params: { tenant: string; id: string }
}

export const revalidate = 60

export default async function ProductPage({ params }: Props) {
  const tenantKey = decodeURIComponent(params.tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productRaw } = await (db as any)
    .from('products')
    .select('id, name, description, price, currency, inventory_count, is_active')
    .eq('id', params.id)
    .eq('tenant_id', siteData.tenant.id)
    .eq('is_active', true)
    .maybeSingle()

  const product = productRaw as {
    id: string; name: string; description: string | null
    price: number; currency: string; inventory_count: number; is_active: boolean
    image_url?: string | null
  } | null

  if (!product) notFound()

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <nav style={{ marginBottom: '2rem', display: 'flex', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          <Link href="/" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Home</Link>
          <span>/</span>
          <Link href="/shop" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Shop</Link>
          <span>/</span>
          <span style={{ color: 'var(--color-text)' }}>{product.name}</span>
        </nav>

        {/* Product detail */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap:                 '3rem',
        }}>
          {/* Image */}
          <div style={{
            borderRadius: '1.25rem',
            overflow:     'hidden',
            background:   'var(--color-surface)',
            border:       '1px solid var(--color-border)',
            aspectRatio:  '1',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}>
            {product.image_url
              ? <img src={product.image_url} alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '5rem', opacity: 0.2 }}>📦</span>
            }
          </div>

          {/* Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '0.5rem' }}>
            <div>
              <h1 style={{
                fontSize:   'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color:      'var(--color-text)',
                margin:     '0 0 0.5rem',
              }}>{product.name}</h1>
              <p style={{
                fontSize:   '1.75rem',
                fontWeight: 700,
                color:      'var(--color-primary)',
                margin:     0,
              }}>
                ${Number(product.price).toFixed(2)}
              </p>
            </div>

            {product.description && (
              <p style={{
                color:      'var(--color-muted)',
                lineHeight: 1.7,
                margin:     0,
                fontSize:   '0.9375rem',
              }}>{product.description}</p>
            )}

            {/* Add to cart — client action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/cart" style={{
                display:        'block',
                background:     'var(--color-primary)',
                color:          '#fff',
                textAlign:      'center',
                padding:        '1rem',
                borderRadius:   '0.875rem',
                fontWeight:     700,
                fontSize:       '1rem',
                textDecoration: 'none',
              }}>
                Add to Cart
              </Link>
              <Link href="/checkout" style={{
                display:        'block',
                background:     'var(--color-surface)',
                border:         '1px solid var(--color-border)',
                color:          'var(--color-text)',
                textAlign:      'center',
                padding:        '1rem',
                borderRadius:   '0.875rem',
                fontWeight:     600,
                fontSize:       '1rem',
                textDecoration: 'none',
              }}>
                Buy Now
              </Link>
            </div>

            <Link href="/shop" style={{
              fontSize:       '0.875rem',
              color:          'var(--color-muted)',
              textDecoration: 'none',
            }}>
              ← Back to Shop
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
