// app/sites/[tenant]/account/page.tsx — Customer account page
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function AccountPage({ params }: Props) {
  const { tenant } = await params
  const tenantKey = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) {
    return (
      <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
        <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{
            fontSize:   'clamp(1.5rem, 3vw, 2rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color:      'var(--color-text)',
            margin:     '0 0 1rem',
          }}>My Account</h1>
          <p style={{ color: 'var(--color-muted)', marginBottom: '2rem' }}>
            Sign in to view your account and orders.
          </p>
          <Link href="/login?next=/account" style={{
            display:        'inline-block',
            background:     'var(--color-primary)',
            color:          '#fff',
            padding:        '0.875rem 2rem',
            borderRadius:   '0.75rem',
            fontWeight:     700,
            textDecoration: 'none',
          }}>
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          fontSize:   'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          color:      'var(--color-text)',
          margin:     '0 0 2rem',
        }}>My Account</h1>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {/* Profile */}
          <div style={{
            background:   'var(--color-surface)',
            border:       '1px solid var(--color-border)',
            borderRadius: '1rem',
            padding:      '1.5rem',
          }}>
            <h2 style={{ fontWeight: 600, color: 'var(--color-text)', margin: '0 0 0.5rem', fontSize: '1rem' }}>
              Profile
            </h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: 0 }}>
              {user.email}
            </p>
          </div>

          {/* Orders quick link */}
          <Link href="/orders" style={{ textDecoration: 'none' }}>
            <div style={{
              background:   'var(--color-surface)',
              border:       '1px solid var(--color-border)',
              borderRadius: '1rem',
              padding:      '1.5rem',
              cursor:       'pointer',
              height:       '100%',
            }}>
              <h2 style={{ fontWeight: 600, color: 'var(--color-text)', margin: '0 0 0.5rem', fontSize: '1rem' }}>
                Order History
              </h2>
              <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem', margin: 0 }}>
                View all orders →
              </p>
            </div>
          </Link>

          {/* Continue shopping */}
          <Link href="/shop" style={{ textDecoration: 'none' }}>
            <div style={{
              background:   'var(--color-primary)',
              borderRadius: '1rem',
              padding:      '1.5rem',
              cursor:       'pointer',
            }}>
              <h2 style={{ fontWeight: 600, color: '#fff', margin: '0 0 0.5rem', fontSize: '1rem' }}>
                Shop
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', margin: 0 }}>
                Browse products →
              </p>
            </div>
          </Link>
        </div>

        {/* Sign out */}
        <div style={{ marginTop: '2rem' }}>
          <form action="/logout" method="POST">
            <button type="submit" style={{
              background:   'transparent',
              border:       '1px solid var(--color-border)',
              color:        'var(--color-muted)',
              padding:      '0.625rem 1.25rem',
              borderRadius: '0.75rem',
              cursor:       'pointer',
              fontSize:     '0.875rem',
            }}>
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
