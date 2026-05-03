export const dynamic = 'force-dynamic'

// app/sites/[tenant]/layout.tsx
//
// Public site layout — loaded for every request rewritten by middleware to
// /sites/[tenant]/*. The [tenant] param is either:
//   • a slug (e.g. "rentalco")        — from *.yourcrm.com subdomains
//   • a hostname (e.g. "www.co.com")  — from verified custom domains
//
// Resolution: slug if no dot; host-based if dot present.

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { normalizeTheme } from '@/lib/website/normalizeTheme'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { resolveSiteUser } from '@/lib/auth/resolveSiteUser'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

interface Props {
  children:  React.ReactNode
  params:    Promise<{ tenant: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  try {
    const { tenant: tenantSlug } = await params
    const tenantKey = decodeURIComponent(tenantSlug)
    const siteData  = tenantKey.includes('.')
      ? await getSiteByHost(tenantKey)
      : await getSiteBySlug(tenantKey)

    if (!siteData) return { title: 'Not Found' }

    const { tenant, settings } = siteData
    const seo   = (settings?.seo_defaults as Record<string, string> | null) ?? {}
    const title = seo.title || settings?.site_name || tenant.name

    const canonicalHost =
      settings?.domain_type === 'custom' && settings.custom_domain
        ? settings.custom_domain
        : `${tenant.slug}.${ROOT_DOMAIN}`

    return {
      title,
      description:  seo.description ?? undefined,
      openGraph: {
        title,
        description: seo.description ?? undefined,
        images:      seo.ogImage ? [seo.ogImage] : undefined,
        url:         `https://${canonicalHost}`,
      },
      alternates: {
        canonical: `https://${canonicalHost}`,
      },
    }
  } catch (err) {
    console.error('[generateMetadata/tenant] error:', err instanceof Error ? err.message : err)
    return { title: 'Site' }
  }
}

export default async function SiteLayout({ children, params }: Props) {
  try {
    const { tenant: tenantSlug } = await params
    const tenantKey = decodeURIComponent(tenantSlug)

    console.log('[SiteLayout] rendering tenant:', tenantKey)

    // Prefer host-based resolution when the original host header is present.
    // getSiteByHost() resolves by tenants.subdomain, custom_domain, and
    // tenant_domains — all the strategies a slug-only lookup misses.
    const headersList = await headers()
    const originalHost = headersList.get('x-original-host')

    const siteData = originalHost
      ? await getSiteByHost(originalHost)
      : tenantKey.includes('.')
        ? await getSiteByHost(tenantKey)
        : await getSiteBySlug(tenantKey)

    if (!siteData) {
      console.error('[SiteLayout] no site found for key:', tenantKey)
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f0f13', color: '#fff' }}>
          <div style={{ textAlign: 'center', padding: '0 1.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Site not found</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>
              This address is not associated with any site.
            </p>
          </div>
        </div>
      )
    }

    const config = await getPublishedSiteConfig(siteData.tenant.id)

    if (!config) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f0f13', color: '#fff' }}>
          <div style={{ textAlign: 'center', padding: '0 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🚧</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{siteData.tenant.name}</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', maxWidth: '28rem' }}>
              This website is coming soon. Check back later.
            </p>
          </div>
        </div>
      )
    }

    const theme = normalizeTheme(config.settings)

    const cssVars = {
      '--color-primary':    theme.primaryColor,
      '--color-accent':     theme.accentColor,
      '--color-bg':         theme.backgroundColor,
      '--color-surface':    theme.surfaceColor,
      '--color-text':       theme.textColor,
      '--color-muted':      theme.mutedColor,
      '--color-border':     theme.borderColor,
      '--font-heading':     `"${theme.fontHeading}", sans-serif`,
      '--font-body':        `"${theme.fontBody}", sans-serif`,
    } as React.CSSProperties

    const isPlatform = headersList.get('x-is-platform') === 'true'
    const basePath   = isPlatform ? `/sites/${tenantSlug}` : ''

    // isAuthenticated is true for any recognised identity: owner, admin, staff,
    // or customer. This drives the header "Account" vs "Sign In" link only.
    // Fine-grained access control happens inside each individual page.
    let isAuthenticated = false
    try {
      const siteCtx = await resolveSiteUser(siteData.tenant.id)
      isAuthenticated = siteCtx !== null
    } catch {
      // Non-fatal — show Login as the safe fallback
    }

    return (
      <div
        className="site-root min-h-screen flex flex-col"
        style={{
          ...cssVars,
          background: theme.backgroundColor,
          color:      theme.textColor,
          fontFamily: `"${theme.fontBody}", sans-serif`,
        }}
      >
        <SiteHeader
          config={config}
          basePath={basePath}
          isAuthenticated={isAuthenticated}
        />
        <main className="flex-1">{children}</main>
        <SiteFooter config={config} />
      </div>
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[SiteLayout] unhandled error:', message)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f0f13', color: '#fff', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            This page could not be loaded
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>
            Please try again in a moment.
          </p>
        </div>
      </div>
    )
  }
}
