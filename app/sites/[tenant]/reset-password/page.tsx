export const dynamic = 'force-dynamic'

// app/sites/[tenant]/reset-password/page.tsx
// Password update page for business website customers.
// Users land here after clicking the password reset email link, which
// exchanges the PKCE code in /auth/callback and redirects here with a
// valid recovery session.

import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from '@/components/site/ResetPasswordForm'
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function ResetPasswordPage({ params }: Props) {
  const { tenant } = await params
  const tenantKey  = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)

  const headersList = await headers()
  const isPlatform  = headersList.get('x-is-platform') === 'true'
  const loginPath   = isPlatform ? `/sites/${tenant}/login` : '/login'
  const forgotPath  = isPlatform ? `/sites/${tenant}/forgot-password` : '/forgot-password'

  // If no session exists, the reset link has expired or already been used.
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) {
    // Redirect to forgot-password with an informative message
    redirect(`${forgotPath}?error=link_expired`)
  }

  const businessName = config?.settings?.site_name ?? siteData.tenant.name

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '2rem 1.25rem',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--color-surface, #fff)',
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: '1.25rem',
        padding: 'clamp(1.5rem, 5vw, 2.5rem)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: 'clamp(1.375rem, 3vw, 1.75rem)', fontWeight: 800,
            fontFamily: 'var(--font-heading, sans-serif)', color: 'var(--color-text, #111)',
            margin: '0 0 0.375rem', lineHeight: 1.2,
          }}>
            Set new password
          </h1>
          <p style={{ color: 'var(--color-muted, #6b7280)', fontSize: '0.9375rem', margin: 0 }}>
            Choose a new password for your {businessName} account.
          </p>
        </div>

        <ResetPasswordForm loginHref={loginPath} />
      </div>
    </div>
  )
}
