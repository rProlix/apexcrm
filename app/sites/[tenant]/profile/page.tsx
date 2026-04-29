export const dynamic = 'force-dynamic'

// app/sites/[tenant]/profile/page.tsx — Customer profile (protected)
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function ProfilePage({ params }: Props) {
  const { tenant } = await params
  const tenantKey  = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  // Middleware ensures user is authenticated before reaching here
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  // Fallback: if somehow unauthenticated, show minimal view
  if (!user) notFound()

  // Fetch customer profile via secure helper function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceClient = getSupabaseServerClient()
  const { data: profile } = await (serviceClient as any)
    .rpc('get_my_customer_account', { p_tenant_id: siteData.tenant.id })
    .maybeSingle()

  const fullName = (profile?.full_name as string | null) ?? user.email?.split('@')[0] ?? 'Customer'
  const email    = (profile?.email    as string | null) ?? user.email    ?? '—'
  const phone    = (profile?.phone    as string | null) ?? null
  const since    = profile?.created_at
    ? new Date(profile.created_at as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : null

  const card: React.CSSProperties = {
    background:   'var(--color-surface)',
    border:       '1px solid var(--color-border)',
    borderRadius: '1rem',
    padding:      '1.5rem',
  }

  const fieldLabel: React.CSSProperties = {
    fontSize:     '0.75rem',
    fontWeight:   600,
    color:        'var(--color-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem',
  }

  const fieldValue: React.CSSProperties = {
    fontSize:   '1rem',
    color:      'var(--color-text)',
    fontWeight: 500,
    margin:     0,
  }

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link href="/account" style={{ color: 'var(--color-muted)', fontSize: '0.875rem', textDecoration: 'none' }}>
            ← Account
          </Link>
        </div>

        <h1 style={{
          fontSize:   'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 800,
          fontFamily: 'var(--font-heading)',
          color:      'var(--color-text)',
          margin:     '0 0 1.75rem',
        }}>
          My Profile
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Identity card */}
          <div style={card}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 1.25rem' }}>
              Personal Information
            </h2>
            <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div>
                <p style={fieldLabel}>Full Name</p>
                <p style={fieldValue}>{fullName}</p>
              </div>
              <div>
                <p style={fieldLabel}>Email</p>
                <p style={fieldValue}>{email}</p>
              </div>
              {phone && (
                <div>
                  <p style={fieldLabel}>Phone</p>
                  <p style={fieldValue}>{phone}</p>
                </div>
              )}
              {since && (
                <div>
                  <p style={fieldLabel}>Member Since</p>
                  <p style={fieldValue}>{since}</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Link href="/orders" style={{ textDecoration: 'none' }}>
              <div style={{ ...card, cursor: 'pointer' }}>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                  Order History
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-primary)' }}>
                  View all orders →
                </p>
              </div>
            </Link>
            <Link href="/shop" style={{ textDecoration: 'none' }}>
              <div style={{ ...card, cursor: 'pointer' }}>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                  Continue Shopping
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-primary)' }}>
                  Browse products →
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
