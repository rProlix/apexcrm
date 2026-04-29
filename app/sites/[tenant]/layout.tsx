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
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { normalizeTheme } from '@/lib/website/normalizeTheme'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

interface Props {
  children:  React.ReactNode
  params:    Promise<{ tenant: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  const tenantKey = decodeURIComponent(tenantSlug)
  const siteData  = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) return { title: 'Not Found' }

  const { tenant, settings } = siteData
  const seo   = (settings?.seo_defaults as Record<string, string> | null) ?? {}
  const title = seo.title || settings?.site_name || tenant.name

  // Canonical URL prefers custom domain if domain_type = 'custom'
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
}

export default async function SiteLayout({ children, params }: Props) {
  const { tenant: tenantSlug } = await params
  const tenantKey = decodeURIComponent(tenantSlug)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: '#0f0f13', color: '#fff' }}>
        <div className="text-center space-y-3 px-6">
          <h1 className="text-2xl font-bold">Site not found</h1>
          <p className="text-white/50 text-sm">This address is not associated with any site.</p>
        </div>
      </div>
    )
  }

  const config = await getPublishedSiteConfig(siteData.tenant.id)

  // Not published → show coming-soon page (no header/footer)
  if (!config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: '#0f0f13', color: '#fff' }}>
        <div className="text-center space-y-4 px-6">
          <div className="h-16 w-16 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center mx-auto text-2xl">
            🚧
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{siteData.tenant.name}</h1>
          <p className="text-white/50 text-sm max-w-sm">
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
      <SiteHeader config={config} />
      <main className="flex-1">{children}</main>
      <SiteFooter config={config} />
    </div>
  )
}
