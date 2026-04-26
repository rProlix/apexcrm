export const dynamic = 'force-dynamic'

// app/sites/[tenant]/shop/page.tsx — Public shop / product catalog
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import Image from 'next/image'

interface Props {
  params: Promise<{ tenant: string }>
}

export const revalidate = 60

export default async function ShopPage({ params }: Props) {
  const { tenant } = await params
  const tenantKey = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productsRaw } = await (db as any)
    .from('products')
    .select('id, name, description, price, currency, inventory_count, is_active')
    .eq('tenant_id', siteData.tenant.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const products = (productsRaw ?? []) as Array<{
    id: string; name: string; description: string | null
    price: number; currency: string; inventory_count: number
    image_url?: string | null
  }>

  const siteName = config.settings.site_name || siteData.tenant.name

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color:      'var(--color-text)',
            margin:     '0 0 0.5rem',
          }}>
            Shop {siteName}
          </h1>
          <p style={{ color: 'var(--color-muted)', margin: 0 }}>
            {products?.length ?? 0} products
          </p>
        </div>

        {(!products || products.length === 0) ? (
          <div style={{
            textAlign:   'center',
            padding:     '5rem 1.5rem',
            color:       'var(--color-muted)',
          }}>
            <p style={{ fontSize: '1.125rem' }}>No products available yet.</p>
          </div>
        ) : (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap:                 '1.25rem',
          }}>
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/shop/${product.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background:   'var(--color-surface)',
                  border:       '1px solid var(--color-border)',
                  borderRadius: '1rem',
                  overflow:     'hidden',
                  height:       '100%',
                }}>
                  <div style={{
                    height:         200,
                    background:     'var(--color-border)',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}>
                    {product.image_url
                      ? <Image src={product.image_url} alt={product.name} width={400} height={400} unoptimized
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '3rem', opacity: 0.3 }}>📦</span>
                    }
                  </div>
                  <div style={{ padding: '1.125rem' }}>
                    <h3 style={{
                      margin:     '0 0 0.375rem',
                      fontSize:   '0.9375rem',
                      fontWeight: 600,
                      color:      'var(--color-text)',
                    }}>{product.name}</h3>
                    {product.description && (
                      <p style={{
                        margin:   '0 0 0.875rem',
                        fontSize: '0.8125rem',
                        color:    'var(--color-muted)',
                        overflow: 'hidden',
                        display:  '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>{product.description}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                        View →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
