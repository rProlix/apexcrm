export const dynamic = 'force-dynamic'

// app/sites/[tenant]/checkout/page.tsx — Checkout page
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function CheckoutPage({ params }: Props) {
  const { tenant } = await params
  const tenantKey = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{
          fontSize:   'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          color:      'var(--color-text)',
          margin:     '0 0 2rem',
        }}>
          Checkout
        </h1>

        <div style={{
          background:   'var(--color-surface)',
          border:       '1px solid var(--color-border)',
          borderRadius: '1rem',
          padding:      '2rem',
          display:      'flex',
          flexDirection: 'column',
          gap:          '1.25rem',
        }}>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: '0.9375rem' }}>
            Complete your purchase below. You must be signed in to check out.
          </p>

          <Link href="/login?next=/checkout" style={{
            display:        'block',
            background:     'var(--color-primary)',
            color:          '#fff',
            textAlign:      'center',
            padding:        '0.875rem',
            borderRadius:   '0.75rem',
            fontWeight:     700,
            textDecoration: 'none',
            fontSize:       '0.9375rem',
          }}>
            Sign In to Continue
          </Link>

          <Link href="/cart" style={{
            textAlign:      'center',
            fontSize:       '0.875rem',
            color:          'var(--color-muted)',
            textDecoration: 'none',
          }}>
            ← Back to Cart
          </Link>
        </div>
      </div>
    </div>
  )
}
