export const dynamic = 'force-dynamic'

// app/sites/[tenant]/account/page.tsx — Customer account dashboard
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { customerLogout } from '@/lib/actions/customer-auth'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function AccountPage({ params }: Props) {
  const { tenant } = await params
  const tenantKey  = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  // Determine routing mode — platform path vs. subdomain/custom domain.
  // When x-is-platform is true, all internal links must be prefixed with
  // /sites/[tenant] so they resolve correctly on the platform root domain.
  const headersList = await headers()
  const isPlatform  = headersList.get('x-is-platform') === 'true'
  const basePath    = isPlatform ? `/sites/${tenant}` : ''
  const loginPath   = `${basePath}/login`

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
          <Link href={`${loginPath}?next=/account`} style={{
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

  const serviceClient = getSupabaseServerClient()

  // Fetch customer profile via the secure helper RPC (multi-tenant safe)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (serviceClient as any)
    .rpc('get_my_customer_account', { p_tenant_id: siteData.tenant.id })
    .maybeSingle()

  const fullName = (profile?.full_name as string | null) ?? user.email?.split('@')[0] ?? 'Customer'
  const email    = (profile?.email    as string | null) ?? user.email ?? '—'

  // Fetch rewards balance for this tenant
  const customerId = profile?.customer_id as string | null
  let pointsBalance: number | null = null

  if (customerId) {
    const { data: rewardsRow } = await serviceClient
      .from('rewards_balances')
      .select('points_balance')
      .eq('tenant_id', siteData.tenant.id)
      .eq('customer_id', customerId)
      .maybeSingle()
    pointsBalance = (rewardsRow?.points_balance as number | null) ?? 0
  }

  const logoutRedirect = `${basePath}/login`

  const card: React.CSSProperties = {
    background:   'var(--color-surface)',
    border:       '1px solid var(--color-border)',
    borderRadius: '1rem',
    padding:      '1.5rem',
  }

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          fontSize:   'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 800,
          fontFamily: 'var(--font-heading)',
          color:      'var(--color-text)',
          margin:     '0 0 0.25rem',
        }}>My Account</h1>
        <p style={{ color: 'var(--color-muted)', margin: '0 0 2rem', fontSize: '0.9375rem' }}>
          Welcome back, {fullName}
        </p>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>

          {/* Profile summary */}
          <div style={card}>
            <h2 style={{ fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.75rem', fontSize: '0.9375rem' }}>
              Profile
            </h2>
            <p style={{ color: 'var(--color-text)', fontWeight: 600, margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>
              {fullName}
            </p>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.8125rem', margin: '0 0 1rem' }}>
              {email}
            </p>
            <Link href={`${basePath}/profile`} style={{
              fontSize:       '0.8125rem',
              color:          'var(--color-primary)',
              fontWeight:     600,
              textDecoration: 'none',
            }}>
              Edit profile →
            </Link>
          </div>

          {/* Orders */}
          <Link href={`${basePath}/orders`} style={{ textDecoration: 'none' }}>
            <div style={{ ...card, cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}>
              <h2 style={{ fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>
                Order History
              </h2>
              <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem', margin: 0, fontWeight: 600 }}>
                View all orders →
              </p>
            </div>
          </Link>

          {/* Rewards */}
          <Link href={`${basePath}/rewards`} style={{ textDecoration: 'none' }}>
            <div style={{ ...card, cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}>
              <h2 style={{ fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>
                Rewards
              </h2>
              {pointsBalance !== null ? (
                <p style={{ color: 'var(--color-primary)', fontSize: '1.25rem', margin: 0, fontWeight: 800 }}>
                  {pointsBalance.toLocaleString()} pts
                </p>
              ) : (
                <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem', margin: 0, fontWeight: 600 }}>
                  View rewards →
                </p>
              )}
            </div>
          </Link>

          {/* Shop */}
          <Link href={`${basePath}/shop`} style={{ textDecoration: 'none' }}>
            <div style={{
              ...card,
              background: 'var(--color-primary)',
              border:     'none',
              cursor:     'pointer',
              height:     '100%',
              boxSizing:  'border-box',
            }}>
              <h2 style={{ fontWeight: 700, color: '#fff', margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>
                Shop
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.875rem', margin: 0 }}>
                Browse products →
              </p>
            </div>
          </Link>
        </div>

        {/* Sign out */}
        <div style={{ marginTop: '2.5rem' }}>
          <form action={customerLogout}>
            <input type="hidden" name="redirect_to" value={logoutRedirect} />
            <button
              type="submit"
              style={{
                background:   'transparent',
                border:       '1px solid var(--color-border)',
                color:        'var(--color-muted)',
                padding:      '0.625rem 1.25rem',
                borderRadius: '0.75rem',
                cursor:       'pointer',
                fontSize:     '0.875rem',
                fontWeight:   500,
              }}
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
