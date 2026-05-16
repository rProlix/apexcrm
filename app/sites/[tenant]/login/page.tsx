export const dynamic = 'force-dynamic'

// app/sites/[tenant]/login/page.tsx — Customer login for public storefronts
import { redirect, notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient } from '@/lib/supabase/server'
import { CustomerLoginForm } from '@/components/site/CustomerLoginForm'

interface Props {
  params:      Promise<{ tenant: string }>
  searchParams: Promise<{ next?: string }>
}

export default async function CustomerLoginPage({ params, searchParams }: Props) {
  const { tenant }       = await params
  const { next = '/account' } = await searchParams
  const tenantKey        = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  // Load published config for branding — fall back gracefully if not published yet.
  // Login must always be accessible regardless of publication state.
  const config = await getPublishedSiteConfig(siteData.tenant.id)

  // If already authenticated, send straight to the destination
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (user) redirect(next.startsWith('/') ? next : '/account')

  // Determine whether this page is served via the platform (/sites/[tenant])
  // or via a tenant subdomain/custom domain (rewritten from the root).
  const headersList  = await headers()
  const isPlatform   = headersList.get('x-is-platform') === 'true'
  const signupPath  = isPlatform
    ? `/sites/${tenant}/signup${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`
    : `/signup${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`

  const forgotPath  = isPlatform
    ? `/sites/${tenant}/forgot-password`
    : '/forgot-password'

  const businessName = config?.settings?.site_name ?? siteData.tenant.name

  return (
    <div style={{
      minHeight:      '100vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '2rem 1.25rem',
    }}>
      <div style={{
        width:        '100%',
        maxWidth:     '420px',
        background:   'var(--color-surface, #fff)',
        border:       '1px solid var(--color-border, #e5e7eb)',
        borderRadius: '1.25rem',
        padding:      'clamp(1.5rem, 5vw, 2.5rem)',
        boxShadow:    '0 4px 32px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontSize:     'clamp(1.375rem, 3vw, 1.75rem)',
            fontWeight:   800,
            fontFamily:   'var(--font-heading, sans-serif)',
            color:        'var(--color-text, #111)',
            margin:       '0 0 0.375rem',
            lineHeight:   1.2,
          }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--color-muted, #6b7280)', fontSize: '0.9375rem', margin: 0 }}>
            Sign in to your {businessName} account
          </p>
        </div>

        <CustomerLoginForm
          tenantId={siteData.tenant.id}
          signupHref={signupPath}
          forgotHref={forgotPath}
          next={next.startsWith('/') ? next : '/account'}
        />
      </div>
    </div>
  )
}
